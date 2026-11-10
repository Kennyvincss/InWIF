import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { encryptSecret } from '../src/keystore'
import { checkSigninPassword, deriveSigninKey, hashSigninKey, isValidVault, randomSalt, signinMessage, verifySigninSignature } from '../src/signin'

const acct = privateKeyToAccount(generatePrivateKey())

describe('sign in with username + password', () => {
  it('derives a sign-in key that depends on password and salt, and is not the vault key', async () => {
    const salt = randomSalt()
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    const a = await deriveSigninKey('correct horse battery 42', salt, 1000)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await deriveSigninKey('correct horse battery 42', salt, 1000)).toBe(a)
    expect(await deriveSigninKey('correct horse battery 43', salt, 1000)).not.toBe(a)
    expect(await deriveSigninKey('correct horse battery 42', randomSalt(), 1000)).not.toBe(a)
    const h = await hashSigninKey(a)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toBe(a)
  })

  it('accepts only a fresh signature from the address itself', async () => {
    const at = new Date().toISOString()
    const sig = await acct.signMessage({ message: signinMessage('enable', acct.address, at) })
    expect((await verifySigninSignature('enable', acct.address, at, sig)).ok).toBe(true)
    // wrong action, wrong address, stale
    expect((await verifySigninSignature('disable', acct.address, at, sig)).ok).toBe(false)
    const other = privateKeyToAccount(generatePrivateKey())
    expect((await verifySigninSignature('enable', other.address, at, sig)).ok).toBe(false)
    expect((await verifySigninSignature('enable', acct.address, at, sig, Date.now() + 3_600_000)).ok).toBe(false)
    expect(signinMessage('enable', acct.address, at)).toContain('never leave my device')
  })

  it('validates the vault shape and the password length', async () => {
    const vault = await encryptSecret({ kind: 'privateKey', privateKey: generatePrivateKey() }, 'correct horse battery 42', 100_000)
    expect(isValidVault(vault)).toBe(true)
    expect(isValidVault({ ...vault, version: 9 })).toBe(false)
    expect(isValidVault({ ...vault, ciphertext: 'x'.repeat(5000) })).toBe(false)
    expect(isValidVault(null)).toBe(false)
    expect(checkSigninPassword('short pass').ok).toBe(false)
    expect(checkSigninPassword('correct horse 42').ok).toBe(true)
  })
})
