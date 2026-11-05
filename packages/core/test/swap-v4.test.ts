import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, maxUint256, parseEther, type PublicClient } from 'viem'
import {
  NATIVE,
  ROBINHOOD_MAINNET,
  WIF_ADDRESS,
  buildRouteSwapTx,
  buildV4SwapTx,
  compareWithMarket,
  findV4Pool,
  permit2Abi,
  reviewTransaction,
  swapApprovalSteps,
  v4PoolId,
  type SwapQuote,
} from '../src'

const v4 = ROBINHOOD_MAINNET.uniswapV4!
const v3 = ROBINHOOD_MAINNET.uniswapV3!
const ME = getAddress('0x1111111111111111111111111111111111111111')

/** A real Pons $WIF buy on Robinhood Chain (tx 0x394da5a9…2064a, block 107109980). */
const REAL_BUY_INPUT = '0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006aed0ff400000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000002400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005173b8ea6923c2d40267890d45c46a3480954773000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000e5e702641ea86f4ae6cc3cdaed2b886f976be04400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000033fea7598ecfb50000000000000000000000000000000000000000000004f8adc83f70b1a45e9300000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000033fea7598ecfb500000000000000000000000000000000000000000000000000000000000000400000000000000000000000005173b8ea6923c2d40267890d45c46a34809547730000000000000000000000000000000000000000000004f8adc83f70b1a45e93'

function v4Quote(over: Partial<SwapQuote> = {}): SwapQuote {
  const { pool, zeroForOne } = findV4Pool(v4, NATIVE, WIF_ADDRESS)!
  return {
    protocol: 'v4',
    tokenIn: NATIVE,
    tokenOut: WIF_ADDRESS,
    amountIn: 0x33fea7598ecfb5n,
    amountOut: 0x4f8adc83f70b1a45e93n,
    fee: 0,
    pool: v4.poolManager,
    priceImpact: 0,
    gasEstimate: 0n,
    route: pool.label,
    v4: { router: v4.universalRouter, key: pool.key, zeroForOne },
    ...over,
  }
}

describe('Uniswap V4 (Pons $WIF pool)', () => {
  it('pool ID matches its key', () => {
    for (const p of v4.pools) expect(v4PoolId(p.key)).toBe(p.id)
  })

  it('finds the pool in both directions', () => {
    expect(findV4Pool(v4, NATIVE, WIF_ADDRESS)?.zeroForOne).toBe(true)
    expect(findV4Pool(v4, WIF_ADDRESS, NATIVE)?.zeroForOne).toBe(false)
    expect(findV4Pool(v4, NATIVE, v3.weth9)).toBeNull()
  })

  it('refuses to route through a pool whose ID does not match', () => {
    const bad = { ...v4, pools: [{ ...v4.pools[0]!, key: { ...v4.pools[0]!.key, fee: 3000 } }] }
    expect(() => findV4Pool(bad, NATIVE, WIF_ADDRESS)).toThrow(/mismatch/)
  })

  it('builds calldata byte-identical to a real Pons trade', () => {
    const tx = buildV4SwapTx(v4Quote(), 0, 1793921012n)
    expect(tx.data).toBe(REAL_BUY_INPUT)
    expect(tx.to).toBe(getAddress(v4.universalRouter))
    expect(tx.value).toBe(0x33fea7598ecfb5n)
  })

  it('selling sends no ETH and applies slippage to the minimum', () => {
    const { pool } = findV4Pool(v4, WIF_ADDRESS, NATIVE)!
    const q = v4Quote({ tokenIn: WIF_ADDRESS, tokenOut: NATIVE, amountIn: 1000n, amountOut: 10_000n, v4: { router: v4.universalRouter, key: pool.key, zeroForOne: false } })
    const tx = buildRouteSwapTx({ v3 }, q, ME, 100, 600)
    expect(tx.value).toBe(0n)
    // amountOutMinimum (9 900 = 1% slippage) appears in the encoded swap params
    expect(tx.data.includes((9900n).toString(16).padStart(64, '0'))).toBe(true)
  })

  it('V3 quotes still route through SwapRouter02', () => {
    const tx = buildRouteSwapTx({ v3 }, { protocol: 'v3', tokenIn: NATIVE, tokenOut: WIF_ADDRESS, amountIn: 5n, amountOut: 6n, fee: 10000, pool: ME, priceImpact: 0, gasEstimate: 0n, route: '' }, ME, 50, 600)
    expect(tx.to).toBe(getAddress(v3.swapRouter02))
  })
})

describe('swap approvals', () => {
  function client(erc20Allowance: bigint, p2: readonly [bigint, number, number]) {
    return {
      readContract: async ({ address }: { address: string }) => (getAddress(address) === getAddress(v4.permit2) ? p2 : erc20Allowance),
    } as unknown as PublicClient
  }
  const sell = () => {
    const { pool } = findV4Pool(v4, WIF_ADDRESS, NATIVE)!
    return v4Quote({ tokenIn: WIF_ADDRESS, tokenOut: NATIVE, amountIn: parseEther('100'), v4: { router: v4.universalRouter, key: pool.key, zeroForOne: false } })
  }

  it('needs nothing for ETH input', async () => {
    expect(await swapApprovalSteps(client(0n, [0n, 0, 0]), v4Quote(), ME, { v4 })).toEqual([])
  })

  it('V4 sell needs an exact ERC-20 approval to Permit2, then an expiring Permit2 allowance', async () => {
    const steps = await swapApprovalSteps(client(0n, [0n, 0, 0]), sell(), ME, { v4, symbol: 'WIF', nowSeconds: 1_000 })
    expect(steps.map((s) => s.to)).toEqual([getAddress(WIF_ADDRESS), getAddress(v4.permit2)])
    const p2 = decodeFunctionData({ abi: permit2Abi, data: steps[1]!.data })
    expect(p2.args).toEqual([getAddress(WIF_ADDRESS), getAddress(v4.universalRouter), parseEther('100'), 1_000 + 24 * 60 * 60])
  })

  it('skips steps that are already in place, and renews an expired Permit2 allowance', async () => {
    expect(await swapApprovalSteps(client(maxUint256, [parseEther('100'), 99_999, 0]), sell(), ME, { v4, nowSeconds: 1_000 })).toEqual([])
    const renew = await swapApprovalSteps(client(maxUint256, [parseEther('100'), 1_050, 0]), sell(), ME, { v4, nowSeconds: 1_000 })
    expect(renew.map((s) => s.to)).toEqual([getAddress(v4.permit2)])
  })
})

describe('market price guard', () => {
  const base = { amountIn: parseEther('1'), decimalsIn: 18, decimalsOut: 18 }
  it('ok within 3%, warn above, block above 10%', () => {
    expect(compareWithMarket({ ...base, priceInUsd: 100, amountOut: parseEther('98'), priceOutUsd: 1 }).level).toBe('ok')
    expect(compareWithMarket({ ...base, priceInUsd: 100, amountOut: parseEther('95'), priceOutUsd: 1 }).level).toBe('warn')
    const bad = compareWithMarket({ ...base, priceInUsd: 100, amountOut: parseEther('81'), priceOutUsd: 1 })
    expect(bad.level).toBe('block')
    expect(bad.loss).toBeCloseTo(0.19, 5)
  })
  it('is unknown without both prices, and never blocks a better-than-market trade', () => {
    expect(compareWithMarket({ ...base, priceInUsd: null, amountOut: 1n, priceOutUsd: 1 }).level).toBe('unknown')
    expect(compareWithMarket({ ...base, priceInUsd: 100, amountOut: parseEther('120'), priceOutUsd: 1 }).level).toBe('ok')
  })
})

describe('review of V4 swap transactions', () => {
  const known = { [v4.universalRouter.toLowerCase()]: 'Uniswap Universal Router', [v4.permit2.toLowerCase()]: 'Uniswap Permit2', [WIF_ADDRESS.toLowerCase()]: 'WIF token' }
  const ctx = { from: ME, expectedChainId: 4663, knownContracts: known, tokenDecimals: { [WIF_ADDRESS.toLowerCase()]: 18 }, tokenSymbols: { [WIF_ADDRESS.toLowerCase()]: 'WIF' } }

  it('shows a Permit2 allowance as an approval with amount and expiry', async () => {
    const { pool } = findV4Pool(v4, WIF_ADDRESS, NATIVE)!
    const q = v4Quote({ tokenIn: WIF_ADDRESS, tokenOut: NATIVE, amountIn: parseEther('5'), v4: { router: v4.universalRouter, key: pool.key, zeroForOne: false } })
    const c = { readContract: async ({ address }: { address: string }) => (getAddress(address) === getAddress(v4.permit2) ? [0n, 0, 0] : maxUint256) } as unknown as PublicClient
    const [step] = await swapApprovalSteps(c, q, ME, { v4, nowSeconds: 1_700_000_000 })
    const r = reviewTransaction({ to: step!.to, data: step!.data, chainId: 4663 }, ctx)
    expect(r.action.kind).toBe('permit2-approve')
    expect(r.lines.find((l) => l.label === 'Allowance')?.value).toBe('5 WIF')
    expect(r.risk).toBe('low')
  })

  it('names the Universal Router swap and recognises the router', () => {
    const tx = buildV4SwapTx(v4Quote(), 50, 2_000_000_000n)
    const r = reviewTransaction({ to: tx.to, data: tx.data, value: tx.value, chainId: 4663 }, ctx)
    expect(r.title).toBe('Interact with Uniswap Universal Router')
    expect(r.lines.find((l) => l.label === 'Function')?.value).toMatch(/Universal Router swap/)
    expect(r.risk).toBe('low')
  })
})
