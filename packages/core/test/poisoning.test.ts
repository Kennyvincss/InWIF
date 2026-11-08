import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import type { ActivityItem } from '../src/activity'
import { addressesLookAlike, findLookalike, flagActivity, sharedEnds, trustedCounterparties } from '../src/poisoning'

const ME = '0x1111111111111111111111111111111111111111' as Address
const FRIEND = '0x156064f872eb6dedc953e7af21e7a7991910ef09' as Address
const FAKE = '0x1560aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa10ef09' as Address // same 4 + 6
const STRANGER = '0x9a3b000000000000000000000000000000004c2d' as Address
const WIF = '0x5173b8eA6923c2d40267890D45C46a3480954773' as Address
const FAKE_WIF = '0x00000000000000000000000000000000000f4e33' as Address
const KNOWN = [{ address: WIF, symbol: 'WIF' }, { address: '0x0000000000000000000000000000000000000000' as Address, symbol: 'ETH' }]

const item = (p: Partial<ActivityItem>): ActivityItem => ({ hash: '0x' + Math.random().toString(16).slice(2), kind: 'token', direction: 'in', from: STRANGER, to: ME, value: '1000', decimals: 18, symbol: 'WIF', tokenAddress: WIF, status: 'success', ...p })

describe('look-alike addresses', () => {
  it('measures shared ends', () => {
    expect(sharedEnds(FRIEND, FAKE)).toEqual({ prefix: 4, suffix: 6 })
  })
  it('flags addresses made to look the same', () => {
    expect(addressesLookAlike(FRIEND, FAKE)).toBe(true)
    expect(addressesLookAlike(FRIEND, FRIEND.toUpperCase().replace('0X', '0x'))).toBe(false) // same address
    expect(addressesLookAlike(FRIEND, STRANGER)).toBe(false)
    expect(addressesLookAlike('0x1560000000000000000000000000000000000000', '0x1560000000000000000000000000000000000001')).toBe(false) // only 1-char suffix… 
    expect(addressesLookAlike(FRIEND, 'not an address')).toBe(false)
  })
  it('finds what an address imitates', () => {
    expect(findLookalike(FAKE, [STRANGER, FRIEND])?.toLowerCase()).toBe(FRIEND)
    expect(findLookalike(STRANGER, [FRIEND])).toBeUndefined()
  })
})

describe('history flags', () => {
  const history = [
    item({ kind: 'native', direction: 'out', from: ME, to: FRIEND, symbol: 'ETH', tokenAddress: undefined }), // a real payment
    item({ direction: 'out', from: ME, to: FAKE, value: '0' }), // attacker's transferFrom(me, fake, 0)
    item({ direction: 'in', from: FAKE, value: '1' }), // dust from the look-alike
    item({ direction: 'in', from: STRANGER, tokenAddress: FAKE_WIF, symbol: 'WIF' }), // fake WIF
    item({ direction: 'in', from: STRANGER, tokenAddress: FAKE_WIF, symbol: 'Visit wif-claim.com' }), // spam
    item({ direction: 'out', from: ME, to: FAKE, tokenAddress: FAKE_WIF, symbol: 'W1F', value: '5' }), // forged "from me" with a fake token
    item({ direction: 'in', from: STRANGER, value: '5000' }), // genuine incoming WIF
  ]
  const trusted = trustedCounterparties(history, { self: [ME], knownTokens: [WIF] })

  it('only trusts real outgoing payments', () => {
    expect(trusted.has(FRIEND.toLowerCase())).toBe(true)
    expect(trusted.has(FAKE.toLowerCase())).toBe(false)
  })

  it('flags poisoning and spam, and leaves genuine entries alone', () => {
    const flags = flagActivity(history, { self: [ME], knownTokens: KNOWN, trusted })
    const r = history.map((h) => flags.get(h)?.reason ?? null)
    expect(r).toEqual([null, 'zero-value', 'lookalike', 'fake-token', 'spam-token', 'lookalike', null])
    expect(flags.get(history[2]!)?.imitates?.toLowerCase()).toBe(FRIEND)
  })
})
