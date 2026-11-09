import type { PricePoint } from './market'

/**
 * "My $WIF journey": cost basis and profit/loss from a wallet's own transfer history.
 *
 * Method (average cost): every $WIF that arrives is valued at the market price on that day
 * and added to the cost basis; every $WIF that leaves realises profit or loss against the
 * average cost at that moment. What is still held is compared with today's price.
 *
 * Limits, stated in the UI: received $WIF (gifts, airdrops) also counts at market price;
 * swap fees and slippage are not included; with daily prices a same-day trade uses that
 * day's close.
 */

export interface JourneyTransfer {
  /** Unix seconds. */
  t: number
  /** $WIF amount (already scaled by decimals). */
  amount: number
  direction: 'in' | 'out'
  /** Tie-breaker for transfers in the same second (block number, then log order). */
  seq?: number
}

export interface JourneyEvent extends JourneyTransfer {
  priceUsd: number | null
  /** Realised profit or loss of an outgoing transfer (null when unpriced). */
  realizedUsd: number | null
}

export interface Journey {
  firstIn: number | null
  lastOut: number | null
  buys: number
  sells: number
  totalIn: number
  totalOut: number
  /** Holding implied by the history (may differ from the real balance if history is partial). */
  historyHolding: number
  /** Real on-chain balance used for today's value. */
  holding: number
  avgCostUsd: number | null
  costBasisUsd: number
  investedUsd: number
  realizedUsd: number
  unrealizedUsd: number | null
  pnlUsd: number | null
  pnlPct: number | null
  /** True when the loaded history does not add up to the on-chain balance (±0.5%). */
  partial: boolean
  /** Incoming transfers that had no market price on their day (not in the cost basis). */
  unpriced: number
  events: JourneyEvent[]
}

/** Last price at or before `t`; a transfer up to one day before the first candle uses it. */
export function priceAt(prices: PricePoint[], t: number): number | null {
  let p: number | null = null
  for (const x of prices) {
    if (x.t <= t) p = x.close
    else break
  }
  if (p === null && prices.length && prices[0]!.t - t < 86_400) p = prices[0]!.close
  return p !== null && p > 0 ? p : null
}

export function computeJourney(transfers: JourneyTransfer[], pricesUsd: PricePoint[], opts: { currentPriceUsd: number | null; balance: number }): Journey {
  const prices = [...pricesUsd].sort((a, b) => a.t - b.t)
  const list = transfers.filter((x) => x.amount > 0).sort((a, b) => a.t - b.t || (a.seq ?? 0) - (b.seq ?? 0))
  let held = 0
  let cost = 0
  let costedHeld = 0 // part of `held` that has a known cost
  let invested = 0
  let realized = 0
  let totalIn = 0
  let totalOut = 0
  let unpriced = 0
  let buys = 0
  let sells = 0
  let firstIn: number | null = null
  let lastOut: number | null = null
  const events: JourneyEvent[] = []

  for (const x of list) {
    const price = priceAt(prices, x.t)
    if (x.direction === 'in') {
      buys++
      totalIn += x.amount
      held += x.amount
      firstIn ??= x.t
      if (price !== null) {
        cost += x.amount * price
        costedHeld += x.amount
        invested += x.amount * price
      } else unpriced++
      events.push({ ...x, priceUsd: price, realizedUsd: null })
    } else {
      sells++
      totalOut += x.amount
      lastOut = x.t
      const avg = costedHeld > 0 ? cost / costedHeld : null
      // Only the part of the sale covered by known-cost $WIF realises a known profit or loss.
      const covered = Math.min(x.amount, costedHeld)
      const r = avg !== null && price !== null ? covered * (price - avg) : null
      if (r !== null) realized += r
      if (avg !== null) {
        cost -= avg * covered
        costedHeld -= covered
      }
      held = Math.max(0, held - x.amount)
      events.push({ ...x, priceUsd: price, realizedUsd: r })
    }
  }

  const avgCostUsd = costedHeld > 0 ? cost / costedHeld : invested > 0 && totalIn > 0 ? invested / totalIn : null
  const partial = Math.abs(held - opts.balance) > Math.max(1e-9, opts.balance * 0.005)
  const unrealizedUsd = opts.currentPriceUsd !== null && avgCostUsd !== null ? opts.balance * (opts.currentPriceUsd - avgCostUsd) : null
  const pnlUsd = unrealizedUsd !== null ? realized + unrealizedUsd : null
  return {
    firstIn,
    lastOut,
    buys,
    sells,
    totalIn,
    totalOut,
    historyHolding: held,
    holding: opts.balance,
    avgCostUsd,
    costBasisUsd: avgCostUsd !== null ? avgCostUsd * opts.balance : 0,
    investedUsd: invested,
    realizedUsd: realized,
    unrealizedUsd,
    pnlUsd,
    pnlPct: pnlUsd !== null && invested > 0 ? (pnlUsd / invested) * 100 : null,
    partial,
    unpriced,
    events: events.reverse(),
  }
}

export interface JourneyBadge {
  emoji: string
  label: string
  detail: string
}

const DAY = 86_400

/** Badges earned from the journey (all from public on-chain history). */
export function journeyBadges(j: Journey, nowSec: number): JourneyBadge[] {
  const out: JourneyBadge[] = []
  const heldDays = j.firstIn !== null ? Math.floor((nowSec - j.firstIn) / DAY) : 0
  const sinceSell = j.lastOut !== null ? Math.floor((nowSec - j.lastOut) / DAY) : null
  if (j.holding > 0 && j.sells === 0 && heldDays >= 1) out.push({ emoji: '🙌', label: 'Never sold', detail: `Holding since day one, ${heldDays} days ago` })
  if (j.holding > 0 && heldDays >= 30 && (sinceSell === null || sinceSell >= 30))
    out.push({ emoji: '💎', label: 'Diamond hands', detail: sinceSell === null ? `${heldDays} days without selling` : `${sinceSell} days since the last sale` })
  if (heldDays >= 60) out.push({ emoji: '⏳', label: 'OG holder', detail: `First $WIF ${heldDays} days ago` })
  if (j.pnlPct !== null && j.pnlPct > 0) out.push({ emoji: '📈', label: 'In profit', detail: `Up ${j.pnlPct.toFixed(1)}% overall` })
  if (j.buys >= 5) out.push({ emoji: '🛒', label: 'Stacker', detail: `${j.buys} times you added $WIF` })
  return out
}
