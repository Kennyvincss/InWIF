import { describe, expect, it } from 'vitest'
import { parseUnits } from 'viem'
import { percentOf } from '@/lib/amount'

describe('percentage amounts', () => {
  const bal = parseUnits('15863.728802322492967609', 18)
  it('rounds down to 6 decimals below 100% and never exceeds the share', () => {
    expect(percentOf(bal, 18, 25)).toBe('3965.9322')
    expect(parseUnits(percentOf(bal, 18, 50), 18) <= bal / 2n).toBe(true)
  })
  it('100% of a token is the exact balance (no dust); ETH can round down', () => {
    expect(percentOf(bal, 18, 100)).toBe('15863.728802322492967609')
    expect(percentOf(parseUnits('0.001968239608148', 18), 18, 100, false)).toBe('0.001968')
  })
  it('handles tiny and zero balances', () => {
    expect(percentOf(0n, 18, 50)).toBe('0')
    expect(percentOf(5n, 18, 100)).toBe('0.000000000000000005')
    expect(percentOf(1_000_000n, 6, 25)).toBe('0.25')
  })
})
