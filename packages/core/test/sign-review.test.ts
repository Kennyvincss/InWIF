import { describe, expect, it } from 'vitest'
import { stringToHex } from 'viem'
import { decodePersonalMessage, parseTypedData, reviewPersonalSign, reviewTypedData, WIF_ADDRESS } from '../src'

const SPENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const ctx = { expectedChainId: 4663, tokenDecimals: { [WIF_ADDRESS.toLowerCase()]: 18 }, tokenSymbols: { [WIF_ADDRESS.toLowerCase()]: 'WIF' } }

describe('personal_sign review', () => {
  it('decodes readable text and keeps it low risk', () => {
    const r = reviewPersonalSign(stringToHex('Welcome to the app! Nonce: 42'))
    expect(r.lines[0]!.value).toBe('Welcome to the app! Nonce: 42')
    expect(r.risk).toBe('low')
  })
  it('flags blind signing of a 32-byte hash as dangerous', () => {
    const r = reviewPersonalSign('0x' + 'ab'.repeat(32))
    expect(r.findings.map((f) => f.code)).toContain('blind-sign')
    expect(r.risk).toBe('high')
  })
  it('flags a sign-in message for a different domain', () => {
    const msg = stringToHex('evil.example wants you to sign in with your Ethereum account:\n0xabc')
    const r = reviewPersonalSign(msg, { dappOrigin: 'https://app.uniswap.org' })
    expect(r.findings.map((f) => f.code)).toContain('siwe-domain-mismatch')
  })
  it('accepts plain (non-hex) strings', () => {
    expect(decodePersonalMessage('hello')).toEqual({ text: 'hello', isUtf8: true, bytes: 5 })
  })
})

describe('typed data review', () => {
  const permit = {
    domain: { name: 'World is Flat', version: '1', chainId: 4663, verifyingContract: WIF_ADDRESS },
    types: { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Permit',
    message: { owner: SPENDER, spender: SPENDER, value: (2n ** 256n - 1n).toString(), nonce: '0', deadline: '9999999999999' },
  }
  it('treats an EIP-2612 permit as high risk and flags unlimited amounts', () => {
    const r = reviewTypedData(parseTypedData(JSON.stringify(permit)), ctx)
    const codes = r.findings.map((f) => f.code)
    expect(codes).toContain('permit')
    expect(codes).toContain('unlimited-approval')
    expect(r.lines.find((l) => l.label === 'Allowance')!.value).toBe('UNLIMITED')
    expect(r.lines.find((l) => l.label === 'Valid until')!.value).toBe('never expires')
  })
  it('shows a bounded permit amount with token symbol', () => {
    const r = reviewTypedData({ ...permit, message: { ...permit.message, value: '5000000000000000000' } }, ctx)
    expect(r.lines.find((l) => l.label === 'Allowance')!.value).toBe('5 WIF')
    expect(r.findings.map((f) => f.code)).not.toContain('unlimited-approval')
  })
  it('recognises Permit2 signatures', () => {
    const r = reviewTypedData(
      { domain: { name: 'Permit2', chainId: 4663, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' }, types: { PermitSingle: [] }, primaryType: 'PermitSingle', message: { details: { token: WIF_ADDRESS, amount: (2n ** 160n - 1n).toString(), expiration: '0', nonce: '0' }, spender: SPENDER, sigDeadline: '1893456000' } },
      ctx,
    )
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['permit2', 'unlimited-approval']))
  })
  it('flags a chain mismatch', () => {
    const r = reviewTypedData({ ...permit, domain: { ...permit.domain, chainId: 1 } }, ctx)
    expect(r.findings.map((f) => f.code)).toContain('chain-mismatch')
  })
  it('shows generic typed data fields and rejects malformed input', () => {
    const r = reviewTypedData({ domain: { name: 'Mail', chainId: 4663 }, types: { Mail: [] }, primaryType: 'Mail', message: { contents: 'Hello', to: 'Bob' } }, ctx)
    expect(r.lines.find((l) => l.label === 'contents')!.value).toBe('Hello')
    expect(r.risk).toBe('low')
    expect(() => parseTypedData('{"x":1}')).toThrow()
  })
})
