import { describe, expect, it } from 'vitest'
import { computeJourney, journeyBadges, priceAt } from '../src/journey'

const D = 86_400
const prices = [
  { t: 1 * D, close: 0.001 },
  { t: 2 * D, close: 0.002 },
  { t: 3 * D, close: 0.003 },
]

describe('priceAt', () => {
  it('uses the last close at or before the time', () => {
    expect(priceAt(prices, 2 * D + 100)).toBe(0.002)
    expect(priceAt(prices, 10 * D)).toBe(0.003)
  })
  it('uses the first candle for a transfer up to a day before it, otherwise unknown', () => {
    expect(priceAt(prices, 1 * D - 3600)).toBe(0.001)
    expect(priceAt(prices, 0)).toBe(null)
  })
})

describe('computeJourney (average cost)', () => {
  const transfers = [
    { t: 1 * D, amount: 1000, direction: 'in' as const },
    { t: 2 * D, amount: 1000, direction: 'in' as const },
    { t: 3 * D, amount: 500, direction: 'out' as const },
  ]
  const j = computeJourney(transfers, prices, { currentPriceUsd: 0.004, balance: 1500 })

  it('averages buys and realises sells against the average', () => {
    expect(j.avgCostUsd).toBeCloseTo(0.0015)
    expect(j.investedUsd).toBeCloseTo(3)
    expect(j.realizedUsd).toBeCloseTo(0.75)
    expect(j.unrealizedUsd).toBeCloseTo(3.75)
    expect(j.pnlUsd).toBeCloseTo(4.5)
    expect(j.pnlPct).toBeCloseTo(150)
    expect(j.partial).toBe(false)
    expect(j.buys).toBe(2)
    expect(j.sells).toBe(1)
    expect(j.firstIn).toBe(1 * D)
    expect(j.events[0]!.direction).toBe('out') // newest first
    expect(j.events[0]!.realizedUsd).toBeCloseTo(0.75)
  })

  it('flags history that does not add up to the balance', () => {
    expect(computeJourney(transfers, prices, { currentPriceUsd: 0.004, balance: 9000 }).partial).toBe(true)
  })

  it('keeps unpriced transfers out of the cost basis', () => {
    const k = computeJourney([{ t: 0, amount: 100, direction: 'in' }, ...transfers], prices, { currentPriceUsd: 0.004, balance: 1600 })
    expect(k.unpriced).toBe(1)
    expect(k.investedUsd).toBeCloseTo(3)
  })

  it('orders same-second transfers by block', () => {
    const k = computeJourney(
      [
        { t: 3 * D, amount: 250, direction: 'out', seq: 11 },
        { t: 3 * D, amount: 1000, direction: 'in', seq: 10 },
      ],
      prices,
      { currentPriceUsd: 0.003, balance: 750 },
    )
    expect(k.historyHolding).toBe(750)
    expect(k.partial).toBe(false)
  })

  it('handles a wallet with no history', () => {
    const e = computeJourney([], prices, { currentPriceUsd: 0.004, balance: 0 })
    expect(e.avgCostUsd).toBe(null)
    expect(e.pnlUsd).toBe(null)
    expect(e.partial).toBe(false)
  })
})

describe('journeyBadges', () => {
  it('awards badges from history', () => {
    const j = computeJourney([{ t: 1 * D, amount: 1000, direction: 'in' }], prices, { currentPriceUsd: 0.004, balance: 1000 })
    const labels = journeyBadges(j, 100 * D).map((b) => b.label)
    expect(labels).toEqual(['Never sold', 'Diamond hands', 'OG holder', 'In profit'])
  })
  it('no diamond hands right after a sale', () => {
    const j = computeJourney(
      [
        { t: 1 * D, amount: 1000, direction: 'in' },
        { t: 95 * D, amount: 10, direction: 'out' },
      ],
      prices,
      { currentPriceUsd: 0.0005, balance: 990 },
    )
    const labels = journeyBadges(j, 100 * D).map((b) => b.label)
    expect(labels).not.toContain('Diamond hands')
    expect(labels).not.toContain('Never sold')
    expect(labels).not.toContain('In profit')
  })
})
