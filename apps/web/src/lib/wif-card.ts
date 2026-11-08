/** Holder tiers by amount held (fun labels, computed from the public balance). */
export function holderTier(amount: number) {
  if (amount <= 0) return { name: 'Explorer', emoji: '🧭' }
  if (amount < 10_000) return { name: 'Shrimp', emoji: '🦐' }
  if (amount < 100_000) return { name: 'Fish', emoji: '🐟' }
  if (amount < 1_000_000) return { name: 'Dolphin', emoji: '🐬' }
  if (amount < 10_000_000) return { name: 'Shark', emoji: '🦈' }
  return { name: 'Whale', emoji: '🐋' }
}
