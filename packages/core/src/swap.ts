/**
 * Token swaps via Uniswap V3 on Robinhood Chain (QuoterV2 + SwapRouter02).
 *
 * InWIF adds NO fee: the calldata built here sends the full input to the
 * Uniswap router and the full output to the user. The only costs are the
 * network gas fee and the Uniswap pool's liquidity-provider fee (the pool's
 * fee tier), both shown to the user before confirmation.
 */
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import type { UniswapV3Config, V4PoolKey } from './networks'

export const NATIVE = 'native' as const
export type SwapToken = Address | typeof NATIVE

export const quoterV2Abi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])
export const factoryAbi = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)'])
export const swapRouter02Abi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
])

/** SwapRouter02 sentinel meaning "keep output in the router" (used before unwrapping WETH). */
export const ADDRESS_THIS: Address = '0x0000000000000000000000000000000000000002'

export interface SwapQuote {
  /** Uniswap protocol version that produced the quote (default 'v3'). */
  protocol?: 'v3' | 'v4'
  tokenIn: SwapToken
  tokenOut: SwapToken
  amountIn: bigint
  amountOut: bigint
  fee: number
  pool: Address
  /** Fractional price impact estimate, e.g. 0.012 = 1.2%. */
  priceImpact: number | null
  gasEstimate: bigint
  route: string
  /**
   * Fraction of the trade the pool keeps as its fee. V3: the fee tier. V4: measured
   * on-chain (quote against spot price), so it includes any fee a hook takes.
   */
  poolFeeFraction?: number | null
  /** Who receives the pool fee. */
  feeNote?: string
  /** V4 only: what the Universal Router needs to execute the swap. */
  v4?: { router: Address; key: V4PoolKey; zeroForOne: boolean }
}

export type MarketCheckLevel = 'ok' | 'warn' | 'block' | 'unknown'

/** Above these, a swap is flagged / refused compared with the market price. */
export const MARKET_WARN_FRACTION = 0.03
export const MARKET_BLOCK_FRACTION = 0.1

/**
 * Compare what a swap gives with what the same tokens are worth at market prices
 * (USD, e.g. from GeckoTerminal). `loss` is the fraction of value lost; it includes
 * pool fees and price impact, and is negative when the swap beats the market price.
 */
export function compareWithMarket(p: {
  amountIn: bigint
  decimalsIn: number
  priceInUsd: number | null | undefined
  amountOut: bigint
  decimalsOut: number
  priceOutUsd: number | null | undefined
}): { loss: number | null; level: MarketCheckLevel } {
  if (!p.priceInUsd || !p.priceOutUsd || p.priceInUsd <= 0 || p.priceOutUsd <= 0) return { loss: null, level: 'unknown' }
  const inUsd = Number(formatUnits(p.amountIn, p.decimalsIn)) * p.priceInUsd
  const outUsd = Number(formatUnits(p.amountOut, p.decimalsOut)) * p.priceOutUsd
  if (!(inUsd > 0) || !Number.isFinite(outUsd)) return { loss: null, level: 'unknown' }
  const loss = 1 - outUsd / inUsd
  return { loss, level: loss > MARKET_BLOCK_FRACTION ? 'block' : loss > MARKET_WARN_FRACTION ? 'warn' : 'ok' }
}

const resolve = (t: SwapToken, cfg: UniswapV3Config): Address => (t === NATIVE ? getAddress(cfg.weth9) : getAddress(t))

async function quoteSingle(
  client: PublicClient,
  cfg: UniswapV3Config,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
) {
  const { result } = await client.simulateContract({
    address: cfg.quoterV2,
    abi: quoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
  })
  return { amountOut: result[0], gasEstimate: result[3] }
}

/**
 * Find the best single-pool quote across fee tiers. Throws a descriptive error
 * if no pool with liquidity exists.
 */
export async function getBestQuote(
  client: PublicClient,
  cfg: UniswapV3Config,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountIn: bigint,
): Promise<SwapQuote> {
  const a = resolve(tokenIn, cfg)
  const b = resolve(tokenOut, cfg)
  if (a === b) throw new Error('Choose two different tokens.')
  if (amountIn <= 0n) throw new Error('Enter an amount.')

  const candidates = await Promise.all(
    cfg.feeTiers.map(async (fee) => {
      try {
        const pool = await client.readContract({ address: cfg.factory, abi: factoryAbi, functionName: 'getPool', args: [a, b, fee] })
        if (pool === zeroAddress) return null
        const q = await quoteSingle(client, cfg, a, b, amountIn, fee)
        return { fee, pool: getAddress(pool), ...q }
      } catch {
        return null
      }
    }),
  )
  const best = candidates
    .filter((c): c is NonNullable<typeof c> => c !== null && c.amountOut > 0n)
    .sort((x, y) => (y.amountOut > x.amountOut ? 1 : y.amountOut < x.amountOut ? -1 : 0))[0]
  if (!best) throw new Error('Not enough liquidity to swap this pair right now.')

  // Estimate price impact by comparing against a quote for 1/1000th of the size.
  let priceImpact: number | null = null
  const probe = amountIn / 1000n
  if (probe > 0n) {
    try {
      const small = await quoteSingle(client, cfg, a, b, probe, best.fee)
      if (small.amountOut > 0n) {
        const SCALE = 10n ** 18n
        const execRate = (best.amountOut * SCALE) / amountIn
        const spotRate = (small.amountOut * SCALE) / probe
        priceImpact = spotRate > 0n ? Math.max(0, 1 - Number((execRate * 1_000_000n) / spotRate) / 1_000_000) : null
      }
    } catch {
      priceImpact = null
    }
  }

  return {
    protocol: 'v3',
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: best.amountOut,
    fee: best.fee,
    pool: best.pool,
    priceImpact,
    gasEstimate: best.gasEstimate,
    route: `Uniswap V3 · ${(best.fee / 10_000).toFixed(2)}% pool`,
    poolFeeFraction: best.fee / 1_000_000,
    feeNote: 'to Uniswap liquidity providers',
  }
}

/** Minimum output after slippage. `slippageBps` = basis points (50 = 0.5%). */
export function minimumReceived(amountOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 5000) throw new Error('Slippage must be between 0% and 50%.')
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n
}

export interface SwapTx {
  to: Address
  data: Hex
  value: bigint
  /** ERC-20 the router needs allowance for (undefined for native input). */
  approvalToken?: Address
}

export function buildSwapTx(
  cfg: UniswapV3Config,
  quote: SwapQuote,
  recipient: Address,
  slippageBps: number,
  deadlineSeconds: number,
): SwapTx {
  const minOut = minimumReceived(quote.amountOut, slippageBps)
  const tokenIn = resolve(quote.tokenIn, cfg)
  const tokenOut = resolve(quote.tokenOut, cfg)
  const nativeOut = quote.tokenOut === NATIVE
  const swap = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn,
        tokenOut,
        fee: quote.fee,
        recipient: nativeOut ? ADDRESS_THIS : recipient,
        amountIn: quote.amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
  const calls: Hex[] = [swap]
  if (nativeOut) {
    calls.push(encodeFunctionData({ abi: swapRouter02Abi, functionName: 'unwrapWETH9', args: [minOut, recipient] }))
  }
  const data = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: 'multicall',
    args: [BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds), calls],
  })
  return {
    to: getAddress(cfg.swapRouter02),
    data,
    value: quote.tokenIn === NATIVE ? quote.amountIn : 0n,
    approvalToken: quote.tokenIn === NATIVE ? undefined : tokenIn,
  }
}

/** Check that every configured Uniswap contract actually has code on this network. */
export async function verifyUniswapDeployment(client: PublicClient, cfg: UniswapV3Config) {
  const entries = Object.entries({ factory: cfg.factory, quoterV2: cfg.quoterV2, swapRouter02: cfg.swapRouter02, weth9: cfg.weth9 })
  const results = await Promise.all(
    entries.map(async ([name, address]) => {
      const code = await client.getCode({ address: address as Address }).catch(() => undefined)
      return { name, address: address as Address, deployed: !!code && code !== '0x' }
    }),
  )
  return { ok: results.every((r) => r.deployed), contracts: results }
}
