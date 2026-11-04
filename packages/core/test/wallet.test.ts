import { describe, expect, it } from 'vitest'
import {
  accountFromMnemonic,
  checkMnemonic,
  checkPassword,
  createMnemonic,
  decryptSecret,
  derivePrivateKey,
  encryptSecret,
  isEncryptedVault,
  normalisePrivateKey,
  pickVerificationIndices,
  verifyBackupWords,
  WrongPasswordError,
} from '../src'

const ANVIL = 'test test test test test test test test test test test junk'

describe('mnemonic', () => {
  it('generates valid 12 and 24 word phrases', () => {
    expect(createMnemonic(128).split(' ')).toHaveLength(12)
    expect(createMnemonic(256).split(' ')).toHaveLength(24)
    expect(checkMnemonic(createMnemonic()).ok).toBe(true)
  })
  it('derives standard BIP-44 Ethereum accounts', () => {
    expect(accountFromMnemonic(ANVIL, 0).address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(accountFromMnemonic(ANVIL, 1).address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    expect(derivePrivateKey(ANVIL, 0)).toBe('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
  })
  it('rejects bad checksums, unknown words and wrong lengths', () => {
    expect(checkMnemonic('test test test test test test test test test test test test').ok).toBe(false)
    expect(checkMnemonic('notaword '.repeat(12)).unknownWords.length).toBeGreaterThan(0)
    expect(checkMnemonic('test test test').ok).toBe(false)
  })
  it('normalises whitespace and case', () => {
    expect(checkMnemonic(`  ${ANVIL.toUpperCase().replace(/ /g, '   ')} `).ok).toBe(true)
  })
  it('picks distinct, in-range verification indices', () => {
    for (let i = 0; i < 50; i++) {
      const idx = pickVerificationIndices(12, 3)
      expect(new Set(idx).size).toBe(3)
      idx.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThan(12)
      })
    }
    const words = ANVIL.split(' ')
    expect(verifyBackupWords(ANVIL, { 0: words[0]!, 11: 'junk' })).toBe(true)
    expect(verifyBackupWords(ANVIL, { 11: 'test' })).toBe(false)
  })
})

describe('private keys', () => {
  it('normalises and validates', () => {
    expect(normalisePrivateKey('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')).toMatch(/^0x/)
    expect(normalisePrivateKey('0x' + '0'.repeat(64))).toBeNull()
    expect(normalisePrivateKey('0x' + 'f'.repeat(64))).toBeNull() // >= curve order
    expect(normalisePrivateKey('0x1234')).toBeNull()
  })
})

describe('keystore', () => {
  it('round-trips secrets with AES-GCM and rejects wrong passwords', async () => {
    const v = await encryptSecret({ kind: 'mnemonic', phrase: ANVIL }, 'correct horse 9', 1000)
    expect(isEncryptedVault(v)).toBe(true)
    expect(JSON.stringify(v)).not.toContain('junk')
    expect(await decryptSecret(v, 'correct horse 9')).toEqual({ kind: 'mnemonic', phrase: ANVIL })
    await expect(decryptSecret(v, 'wrong password 1')).rejects.toBeInstanceOf(WrongPasswordError)
  })
  it('detects tampering', async () => {
    const v = await encryptSecret({ kind: 'mnemonic', phrase: ANVIL }, 'correct horse 9', 1000)
    const bad = { ...v, ciphertext: v.ciphertext.slice(0, -4) + (v.ciphertext.endsWith('AAA=') ? 'BBB=' : 'AAA=') }
    await expect(decryptSecret(bad, 'correct horse 9')).rejects.toBeInstanceOf(WrongPasswordError)
  })
  it('uses unique salts/IVs and the production iteration count by default', async () => {
    const a = await encryptSecret({ kind: 'privateKey', privateKey: '0x01' as `0x${string}` }, 'pw-long-enough-1', 1000)
    const b = await encryptSecret({ kind: 'privateKey', privateKey: '0x01' as `0x${string}` }, 'pw-long-enough-1', 1000)
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
    const { KDF_ITERATIONS } = await import('../src/keystore')
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })
  it('enforces a password policy', () => {
    expect(checkPassword('short').ok).toBe(false)
    expect(checkPassword('longenoughpassword1').ok).toBe(true)
  })
})
