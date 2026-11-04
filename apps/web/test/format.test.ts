import { describe, expect, it } from 'vitest'
import { fmtPct, fmtToken, fmtUsd } from '@/lib/format'

describe('formatting', () => {
  it('formats token amounts without losing precision', () => {
    expect(fmtToken(1_234_567_890_000_000_000_000n, 18, 2)).toBe('1,234.56')
    expect(fmtToken(1n, 18)).toBe('<0.000001')
    expect(fmtToken(0n, 18)).toBe('0')
  })
  it('never invents a value for missing prices', () => {
    expect(fmtUsd(null)).toBe('—')
    expect(fmtUsd(undefined)).toBe('—')
    expect(fmtUsd(Number.NaN)).toBe('—')
    expect(fmtPct(null)).toBe('—')
  })
  it('formats small and large USD values', () => {
    expect(fmtUsd(0.000611)).toBe('$0.000611')
    expect(fmtUsd(1234.5)).toBe('$1,234.50')
    expect(fmtUsd(72_000, { compact: true })).toBe('$72K')
  })
})
