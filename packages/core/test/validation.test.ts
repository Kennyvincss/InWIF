import { describe, expect, it } from 'vitest'
import { checkRecipient, containsSecret, looksLikeSecret, parseAmount, redact, WIF_ADDRESS } from '../src'

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('recipient validation', () => {
  it('accepts valid checksummed addresses', () => {
    const r = checkRecipient(OTHER, { self: SELF })
    expect(r.ok).toBe(true)
    expect(r.address).toBe(OTHER)
  })
  it('rejects bad checksum, invalid, zero, and pasted secrets', () => {
    expect(checkRecipient(OTHER.replace('C51', 'c51')).ok).toBe(false)
    expect(checkRecipient('0x1234').ok).toBe(false)
    expect(checkRecipient('0x0000000000000000000000000000000000000000').ok).toBe(false)
    const s = checkRecipient('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    expect(s.ok).toBe(false)
    expect(s.findings[0]!.code).toBe('secret-pasted')
  })
  it('warns on self-send, token contracts, missing checksum; blocks flagged', () => {
    expect(checkRecipient(SELF, { self: SELF }).findings.map((f) => f.code)).toContain('self')
    expect(checkRecipient(WIF_ADDRESS, { knownTokens: [WIF_ADDRESS] }).findings.map((f) => f.code)).toContain('token-contract')
    expect(checkRecipient(OTHER.toLowerCase()).findings.map((f) => f.code)).toContain('no-checksum')
    expect(checkRecipient(OTHER, { blocklist: new Set([OTHER.toLowerCase()]) }).ok).toBe(false)
  })
})

describe('amount parsing', () => {
  it('parses decimals strictly', () => {
    expect(parseAmount('1.5', 18).raw).toBe(1_500_000_000_000_000_000n)
    expect(parseAmount('1.1234567', 6).ok).toBe(false)
    expect(parseAmount('0', 18).ok).toBe(false)
    expect(parseAmount('-1', 18).ok).toBe(false)
    expect(parseAmount('abc', 18).ok).toBe(false)
    expect(parseAmount('2', 18, 10n ** 18n).error).toBe('Insufficient balance.')
  })
})

describe('secret detection & redaction', () => {
  const phrase = 'test test test test test test test test test test test junk'
  it('detects secrets', () => {
    expect(looksLikeSecret(phrase)).toBe(true)
    expect(looksLikeSecret(OTHER)).toBe(false)
    expect(containsSecret({ a: { privateKey: 'x' } })).toBe(true)
    expect(containsSecret({ note: phrase })).toBe(true)
    expect(containsSecret({ address: OTHER })).toBe(false)
  })
  it('redacts secrets but keeps addresses and tx hashes intact where unambiguous', () => {
    const r = redact({ mnemonic: phrase, msg: `key=0x${'ab'.repeat(32)}`, addr: OTHER })
    expect(r.mnemonic).toBe('[REDACTED]')
    expect(r.msg).toBe('key=[REDACTED]')
    expect(r.addr).toBe(OTHER)
  })
})
