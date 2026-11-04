import { describe, expect, it } from 'vitest'
import { encodeFunctionData, erc20Abi, maxUint256, parseEther } from 'viem'
import { decodeTransaction, reviewTransaction, revokeCalldata, WIF_ADDRESS } from '../src'

const FROM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const SPENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const ctx = { from: FROM, expectedChainId: 4663, tokenDecimals: { [WIF_ADDRESS.toLowerCase()]: 18 }, tokenSymbols: { [WIF_ADDRESS.toLowerCase()]: 'WIF' } } as const

describe('transaction review', () => {
  it('decodes native transfers', () => {
    const r = reviewTransaction({ to: SPENDER, value: parseEther('1'), chainId: 4663 }, { ...ctx })
    expect(r.title).toBe('Send ETH')
    expect(r.lines.find((l) => l.label === 'InWIF fee')!.value).toMatch(/None/)
    expect(r.risk).toBe('low')
  })
  it('decodes ERC-20 transfers with symbols', () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [SPENDER, parseEther('42')] })
    const r = reviewTransaction({ to: WIF_ADDRESS, data, chainId: 4663 }, { ...ctx })
    expect(r.lines.find((l) => l.label === 'Amount')!.value).toBe('42 WIF')
  })
  it('flags unlimited approvals as high risk', () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SPENDER, maxUint256] })
    const r = reviewTransaction({ to: WIF_ADDRESS, data, chainId: 4663 }, { ...ctx })
    expect(r.risk).toBe('high')
    expect(r.findings.map((f) => f.code)).toContain('unlimited-approval')
  })
  it('recognises revokes', () => {
    const r = reviewTransaction({ to: WIF_ADDRESS, data: revokeCalldata(SPENDER), chainId: 4663 }, { ...ctx })
    expect(r.title).toBe('Revoke token approval')
  })
  it('flags chain mismatch and insufficient balance', () => {
    const r = reviewTransaction({ to: SPENDER, value: parseEther('2'), chainId: 1 }, { ...ctx, nativeBalance: parseEther('1'), maxFeeWei: 1n })
    const codes = r.findings.map((f) => f.code)
    expect(codes).toContain('chain-mismatch')
    expect(codes).toContain('insufficient-native')
  })
  it('treats unknown calls as contract interactions with a warning', () => {
    const d = decodeTransaction({ to: SPENDER, data: '0xdeadbeef00' })
    expect(d.kind).toBe('contract-call')
    const r = reviewTransaction({ to: SPENDER, data: '0xdeadbeef00', chainId: 4663 }, { ...ctx })
    expect(r.risk).toBe('medium')
  })
  it('always includes the not-a-guarantee notice', () => {
    const r = reviewTransaction({ to: SPENDER, value: 1n, chainId: 4663 }, { ...ctx })
    expect(r.findings.some((f) => f.code === 'not-a-guarantee')).toBe(true)
  })
})
