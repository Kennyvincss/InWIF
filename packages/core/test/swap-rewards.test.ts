import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, keccak256, encodeAbiParameters, concat } from 'viem'
import { ADDRESS_THIS, NATIVE, ROBINHOOD_MAINNET, buildCampaignTree, buildSwapTx, minimumReceived, proofFor, swapRouter02Abi, WIF_ADDRESS } from '../src'

const cfg = ROBINHOOD_MAINNET.uniswapV3!
const ME = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

describe('swap calldata', () => {
  it('computes minimum received from slippage', () => {
    expect(minimumReceived(10_000n, 50)).toBe(9_950n)
    expect(() => minimumReceived(1n, 9000)).toThrow()
  })
  it('sends the full output to the user with no InWIF fee (token→token)', () => {
    const tx = buildSwapTx(cfg, { tokenIn: WIF_ADDRESS, tokenOut: cfg.weth9, amountIn: 1000n, amountOut: 500n, fee: 10000, pool: ME, priceImpact: 0, gasEstimate: 0n, route: '' }, ME, 100, 600)
    expect(tx.to).toBe(getAddress(cfg.swapRouter02))
    expect(tx.value).toBe(0n)
    expect(tx.approvalToken).toBe(WIF_ADDRESS)
    const outer = decodeFunctionData({ abi: swapRouter02Abi, data: tx.data })
    expect(outer.functionName).toBe('multicall')
    const inner = decodeFunctionData({ abi: swapRouter02Abi, data: (outer.args as readonly [bigint, readonly `0x${string}`[]])[1][0]! })
    const p = (inner.args as readonly [{ recipient: string; amountIn: bigint; amountOutMinimum: bigint }])[0]
    expect(p.recipient).toBe(ME)
    expect(p.amountIn).toBe(1000n)
    expect(p.amountOutMinimum).toBe(495n)
  })
  it('handles native in (value) and native out (unwrap to user)', () => {
    const tx = buildSwapTx(cfg, { tokenIn: NATIVE, tokenOut: WIF_ADDRESS, amountIn: 7n, amountOut: 9n, fee: 3000, pool: ME, priceImpact: 0, gasEstimate: 0n, route: '' }, ME, 0, 600)
    expect(tx.value).toBe(7n)
    expect(tx.approvalToken).toBeUndefined()
    const tx2 = buildSwapTx(cfg, { tokenIn: WIF_ADDRESS, tokenOut: NATIVE, amountIn: 7n, amountOut: 9n, fee: 3000, pool: ME, priceImpact: 0, gasEstimate: 0n, route: '' }, ME, 0, 600)
    const outer = decodeFunctionData({ abi: swapRouter02Abi, data: tx2.data })
    const calls = (outer.args as readonly [bigint, readonly `0x${string}`[]])[1]
    expect(calls).toHaveLength(2)
    const swap = decodeFunctionData({ abi: swapRouter02Abi, data: calls[0]! })
    expect((swap.args as readonly [{ recipient: string }])[0].recipient).toBe(ADDRESS_THIS)
    const unwrap = decodeFunctionData({ abi: swapRouter02Abi, data: calls[1]! })
    expect(unwrap.functionName).toBe('unwrapWETH9')
    expect((unwrap.args as readonly [bigint, string])[1]).toBe(ME)
  })
})

describe('reward campaign trees', () => {
  it('builds OpenZeppelin-compatible leaves and proofs', () => {
    const alice = ME
    const bob = getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    const t = buildCampaignTree(1n, [
      { account: alice, amount: 100n },
      { account: bob, amount: 250n },
    ])
    expect(t.total).toBe(350n)
    const p = proofFor(t, bob)!
    expect(p.amount).toBe(250n)
    // Leaf = keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))))
    const inner = keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }], [1n, bob, 250n]))
    const leaf = keccak256(concat([inner]))
    expect(t.tree.verify([ '1', bob, '250' ], p.proof)).toBe(true)
    expect(leaf).toMatch(/^0x/)
  })
  it('rejects duplicates and zero amounts', () => {
    expect(() => buildCampaignTree(1n, [{ account: ME, amount: 1n }, { account: ME, amount: 2n }])).toThrow()
    expect(() => buildCampaignTree(1n, [{ account: ME, amount: 0n }])).toThrow()
  })
})
