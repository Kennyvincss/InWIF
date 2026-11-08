import { describe, expect, it } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createUsernameClaim, looksLikeUsername, normaliseUsername, usernameClaimMessage, usernameSkeleton, verifyUsernameClaim } from '../src/usernames'

const acct = privateKeyToAccount(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey())
const sign = (m: string) => acct.signMessage({ message: m })

describe('usernames', () => {
  it('normalises and validates', () => {
    expect(normaliseUsername('@Kenny_V')).toEqual({ ok: true, username: 'kenny_v' })
    expect(normaliseUsername('ab').ok).toBe(false)
    expect(normaliseUsername('9lives').ok).toBe(false)
    expect(normaliseUsername('a'.repeat(21)).ok).toBe(false)
    expect(normaliseUsername('kenny__v').ok).toBe(false)
    expect(normaliseUsername('kenny_').ok).toBe(false)
    expect(normaliseUsername('ken ny').ok).toBe(false)
    expect(normaliseUsername('kénny').ok).toBe(false)
  })

  it('reserves official names and their look-alikes', () => {
    for (const n of ['inwif', 'InWIF_support', 'lnw1f', 'supp0rt', 'admin', 'adm1n', 'wif', 'w1f', 'officialwif']) expect(normaliseUsername(n).ok, n).toBe(false)
  })

  it('collapses look-alike names to one skeleton', () => {
    expect(usernameSkeleton('k3nny')).toBe(usernameSkeleton('kenny'))
    expect(usernameSkeleton('k_e_n_n_y')).toBe(usernameSkeleton('kenny'))
    expect(usernameSkeleton('rnoon')).toBe(usernameSkeleton('moon'))
    expect(usernameSkeleton('bill')).toBe(usernameSkeleton('b1ll'))
    expect(usernameSkeleton('kenny')).not.toBe(usernameSkeleton('kenni_x'))
  })

  it('tells usernames from addresses', () => {
    expect(looksLikeUsername('@kenny')).toBe(true)
    expect(looksLikeUsername('kenny')).toBe(true)
    expect(looksLikeUsername('0x5173b8eA6923c2d40267890D45C46a3480954773')).toBe(false)
    expect(looksLikeUsername('0xabc')).toBe(false)
  })

  it('signs and verifies a claim', async () => {
    const c = await createUsernameClaim('@Kenny', acct.address, sign)
    expect(c.username).toBe('kenny')
    const v = await verifyUsernameClaim(c)
    expect(v.ok).toBe(true)
    expect(usernameClaimMessage(c)).toContain('@kenny')
    expect(usernameClaimMessage(c)).toContain('does not send a transaction')
  })

  it('rejects a claim for someone else’s address or a changed name', async () => {
    const c = await createUsernameClaim('kenny', acct.address, sign)
    expect((await verifyUsernameClaim({ ...c, address: other.address })).ok).toBe(false)
    expect((await verifyUsernameClaim({ ...c, username: 'kenny2' })).ok).toBe(false)
    expect((await verifyUsernameClaim({ ...c, issuedAt: new Date(0).toISOString() })).ok).toBe(false)
    expect((await verifyUsernameClaim({ ...c, username: 'Kenny' })).ok).toBe(false)
    expect((await verifyUsernameClaim({ ...c, signature: '0x1234' })).ok).toBe(false)
    expect((await verifyUsernameClaim(null)).ok).toBe(false)
    // A claim signed by another key for this address fails.
    const forged = await createUsernameClaim('kenny', acct.address, (m) => other.signMessage({ message: m }))
    expect((await verifyUsernameClaim(forged)).ok).toBe(false)
  })
})
