/**
 * Swaps through reviewed Uniswap V4 pools (Universal Router + V4Quoter).
 *
 * V4 pools can carry a hook that runs on every swap and may take a fee, so InWIF
 * only routes through pools listed in the network config, checks the pool ID
 * against its key before quoting, and measures the pool's real fee on-chain
 * (quote versus spot price) so the fee shown is what the pool actually charges.
 *
 * InWIF adds NO fee: the Universal Router pays the whole output to the user
 * (TAKE_ALL), with a minimum-output check that reverts the swap if not met.
 */
import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  keccak256,
  maxUint256,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import type { UniswapV3Config, UniswapV4Config, V4PoolKey, V4PoolListing } from './networks'
import { NATIVE, buildSwapTx, getBestQuote, minimumReceived, type SwapQuote, type SwapToken } from './swap'

export const v4QuoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
])
export const stateViewAbi = parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'])
export const universalRouterAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'])
export const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
])

/** Universal Router command and V4Router action codes (v4-periphery Actions.sol). */
export const UR_V4_SWAP = 0x10
export const V4_SWAP_EXACT_IN_SINGLE = 0x06
export const V4_SETTLE_ALL = 0x0c
export const V4_TAKE_ALL = 0x0f

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

export function v4PoolId(key: V4PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  )
}

const currencyOf = (t: SwapToken): Address => (t === NATIVE ? zeroAddress : getAddress(t))

/** The listed V4 pool for this pair, if any, with the swap direction. */
export function findV4Pool(cfg: UniswapV4Config, tokenIn: SwapToken, tokenOut: SwapToken): { pool: V4PoolListing; zeroForOne: boolean } | null {
  const a = currencyOf(tokenIn)
  const b = currencyOf(tokenOut)
  for (const pool of cfg.pools) {
    const c0 = getAddress(pool.key.currency0)
    const c1 = getAddress(pool.key.currency1)
    if ((a === c0 && b === c1) || (a === c1 && b === c0)) {
      if (v4PoolId(pool.key).toLowerCase() !== pool.id.toLowerCase()) throw new Error(`Pool ID mismatch for ${pool.label}; refusing to route.`)
      return { pool, zeroForOne: a === c0 }
    }
  }
  return null
}

const Q192 = 2n ** 192n

/** Output the spot price alone would give (no fee, no impact). */
function spotOutput(amountIn: bigint, sqrtPriceX96: bigint, zeroForOne: boolean): bigint {
  const p2 = sqrtPriceX96 * sqrtPriceX96
  return zeroForOne ? (amountIn * p2) / Q192 : (amountIn * Q192) / p2
}

async function quoteV4Single(client: PublicClient, cfg: UniswapV4Config, key: V4PoolKey, zeroForOne: boolean, amountIn: bigint) {
  const { result } = await client.simulateContract({
    address: cfg.quoter,
    abi: v4QuoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: '0x' }],
  })
  return { amountOut: result[0], gasEstimate: result[1] }
}

/** Quote a swap through a listed V4 pool, or null if there is none for this pair. */
export async function getV4Quote(
  client: PublicClient,
  cfg: UniswapV4Config,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountIn: bigint,
): Promise<SwapQuote | null> {
  const found = findV4Pool(cfg, tokenIn, tokenOut)
  if (!found || amountIn <= 0n) return null
  const { pool, zeroForOne } = found
  const q = await quoteV4Single(client, cfg, pool.key, zeroForOne, amountIn)
  if (q.amountOut <= 0n) return null

  // Measure the pool's real fee (LP fee + anything the hook takes) and the price impact,
  // using a quote for 1/1000th of the size against the pool's spot price.
  let priceImpact: number | null = null
  let poolFeeFraction: number | null = null
  const probe = amountIn / 1000n
  if (probe > 0n) {
    try {
      const [small, slot0] = await Promise.all([
        quoteV4Single(client, cfg, pool.key, zeroForOne, probe),
        client.readContract({ address: cfg.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [pool.id] }),
      ])
      const spot = spotOutput(probe, slot0[0], zeroForOne)
      const ppm = (x: bigint, y: bigint) => Number((x * 1_000_000n) / y) / 1_000_000
      if (spot > 0n) poolFeeFraction = Math.max(0, 1 - ppm(small.amountOut, spot))
      if (small.amountOut > 0n) priceImpact = Math.max(0, 1 - ppm(q.amountOut * probe, small.amountOut * amountIn))
    } catch {
      /* leave unknown */
    }
  }

  return {
    protocol: 'v4',
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: q.amountOut,
    fee: pool.key.fee,
    pool: getAddress(cfg.poolManager),
    priceImpact,
    gasEstimate: q.gasEstimate,
    route: pool.label,
    poolFeeFraction,
    feeNote: pool.feeNote,
    v4: { router: getAddress(cfg.universalRouter), key: pool.key, zeroForOne },
  }
}

/** Universal Router calldata: V4_SWAP with SWAP_EXACT_IN_SINGLE → SETTLE_ALL → TAKE_ALL. */
export function buildV4SwapTx(quote: SwapQuote, slippageBps: number, deadline: bigint): { to: Address; data: Hex; value: bigint } {
  if (quote.protocol !== 'v4' || !quote.v4) throw new Error('Not a Uniswap V4 quote.')
  const { key, zeroForOne, router } = quote.v4
  const minOut = minimumReceived(quote.amountOut, slippageBps)
  const currencyIn = zeroForOne ? key.currency0 : key.currency1
  const currencyOut = zeroForOne ? key.currency1 : key.currency0
  const swap = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [{ poolKey: key, zeroForOne, amountIn: quote.amountIn, amountOutMinimum: minOut, hookData: '0x' }],
  )
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currencyIn, quote.amountIn])
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currencyOut, minOut])
  const actions = `0x${[V4_SWAP_EXACT_IN_SINGLE, V4_SETTLE_ALL, V4_TAKE_ALL].map((a) => a.toString(16).padStart(2, '0')).join('')}` as Hex
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swap, settle, take]])
  const commands = `0x${UR_V4_SWAP.toString(16).padStart(2, '0')}` as Hex
  return {
    to: getAddress(router),
    data: encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: [commands, [input], deadline] }),
    value: getAddress(currencyIn) === zeroAddress ? quote.amountIn : 0n,
  }
}

export interface ApprovalStep {
  to: Address
  data: Hex
  summary: string
}

const MAX_UINT160 = 2n ** 160n - 1n
/** How long a Permit2 allowance InWIF sets stays valid. */
export const PERMIT2_EXPIRY_SECONDS = 24 * 60 * 60

/**
 * The on-chain approvals a swap still needs, in order. Exact amounts by default.
 * V3 needs the token approved to SwapRouter02. V4 needs the token approved to Permit2,
 * then a Permit2 allowance for the Universal Router (exact amount, expiring in 24 hours).
 * Both are ordinary transactions; nothing is signed off-chain.
 */
export async function swapApprovalSteps(
  client: PublicClient,
  quote: SwapQuote,
  owner: Address,
  opts: { v3?: UniswapV3Config; v4?: UniswapV4Config; unlimited?: boolean; symbol?: string; nowSeconds?: number },
): Promise<ApprovalStep[]> {
  if (quote.tokenIn === NATIVE) return []
  const token = getAddress(quote.tokenIn)
  const sym = opts.symbol ?? 'token'
  const amount = quote.amountIn
  const approveAmount = opts.unlimited ? maxUint256 : amount
  const erc20Approve = (spender: Address) => encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, approveAmount] })
  const allowanceTo = (spender: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })

  if (quote.protocol !== 'v4') {
    if (!opts.v3) throw new Error('Uniswap V3 is not configured on this network.')
    const router = getAddress(opts.v3.swapRouter02)
    return (await allowanceTo(router)) >= amount ? [] : [{ to: token, data: erc20Approve(router), summary: `Approve ${sym} for swapping` }]
  }

  if (!opts.v4 || !quote.v4) throw new Error('Uniswap V4 is not configured on this network.')
  const permit2 = getAddress(opts.v4.permit2)
  const router = getAddress(quote.v4.router)
  if (amount > MAX_UINT160) throw new Error('Amount too large for Permit2.')
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000)
  const [erc20Allowance, p2] = await Promise.all([
    allowanceTo(permit2),
    client.readContract({ address: permit2, abi: permit2Abi, functionName: 'allowance', args: [owner, token, router] }),
  ])
  const steps: ApprovalStep[] = []
  if (erc20Allowance < amount) steps.push({ to: token, data: erc20Approve(permit2), summary: `Approve ${sym} for swapping` })
  const [p2Amount, p2Expiry] = p2
  if (p2Amount < amount || p2Expiry < now + 120) {
    steps.push({
      to: permit2,
      data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, router, amount, now + PERMIT2_EXPIRY_SECONDS] }),
      summary: `Confirm the ${sym} swap allowance`,
    })
  }
  return steps
}

/** Check every configured Uniswap V4 contract has code on this network. */
export async function verifyUniswapV4Deployment(client: PublicClient, cfg: UniswapV4Config) {
  const entries = Object.entries({
    poolManager: cfg.poolManager,
    universalRouter: cfg.universalRouter,
    quoter: cfg.quoter,
    stateView: cfg.stateView,
    permit2: cfg.permit2,
    ...Object.fromEntries(cfg.pools.map((p, i) => [`hook${i}`, p.key.hooks])),
  })
  const results = await Promise.all(
    entries.map(async ([name, address]) => {
      const code = await client.getCode({ address: address as Address }).catch(() => undefined)
      return { name, address: address as Address, deployed: !!code && code !== '0x' }
    }),
  )
  return { ok: results.every((r) => r.deployed), contracts: results }
}

/**
 * Best quote across Uniswap V3 (all fee tiers) and the listed V4 pools.
 * Throws only if neither has a route.
 */
export async function getBestRouteQuote(
  client: PublicClient,
  cfgs: { v3?: UniswapV3Config; v4?: UniswapV4Config },
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountIn: bigint,
): Promise<SwapQuote> {
  if (amountIn <= 0n) throw new Error('Enter an amount.')
  const [v3, v4] = await Promise.all([
    cfgs.v3 ? getBestQuote(client, cfgs.v3, tokenIn, tokenOut, amountIn).catch((e: Error) => e) : null,
    cfgs.v4 ? getV4Quote(client, cfgs.v4, tokenIn, tokenOut, amountIn).catch(() => null) : null,
  ])
  const v3q = v3 instanceof Error ? null : v3
  if (v3q && v4) return v4.amountOut > v3q.amountOut ? v4 : v3q
  if (v4) return v4
  if (v3q) return v3q
  throw v3 instanceof Error ? v3 : new Error('Not enough liquidity to swap this pair right now.')
}

/** Transaction for either protocol. */
export function buildRouteSwapTx(
  cfgs: { v3?: UniswapV3Config },
  quote: SwapQuote,
  recipient: Address,
  slippageBps: number,
  deadlineSeconds: number,
): { to: Address; data: Hex; value: bigint } {
  if (quote.protocol === 'v4') return buildV4SwapTx(quote, slippageBps, BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds))
  if (!cfgs.v3) throw new Error('Uniswap V3 is not configured on this network.')
  const tx = buildSwapTx(cfgs.v3, quote, recipient, slippageBps, deadlineSeconds)
  return { to: tx.to, data: tx.data, value: tx.value }
}
