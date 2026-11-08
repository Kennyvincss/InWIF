import { describe, expect, it } from 'vitest'
import { holderTier } from '@/lib/wif-card'

describe('$WIF holder tiers', () => {
  it('maps holdings to tiers at the boundaries', () => {
    expect(holderTier(0).name).toBe('Explorer')
    expect(holderTier(9_999).name).toBe('Shrimp')
    expect(holderTier(10_000).name).toBe('Fish')
    expect(holderTier(999_999).name).toBe('Dolphin')
    expect(holderTier(1_000_000).name).toBe('Shark')
    expect(holderTier(10_000_000).name).toBe('Whale')
  })
})
