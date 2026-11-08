/**
 * Market data from GeckoTerminal's public API (on-chain DEX prices).
 * Every value is returned with its source; nothing is estimated or invented.
 * When a token has no market, functions return `null` rather than a guess.
 */
import type { Address } from 'viem'

type Fetch = typeof fetch
export const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2'
export const POOL_ID_RE = /^0x[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/

export interface TokenMarket {
  source: 'geckoterminal'
  priceUsd: number | null
  change24hPct: number | null
  fdvUsd: number | null
  marketCapUsd: number | null
  volume24hUsd: number | null
  liquidityUsd: number | null
  topPool?: string
  imageUrl?: string
  fetchedAt: number
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function fetchTokenMarket(
  network: string,
  token: Address,
  f: Fetch = fetch,
  base = GECKOTERMINAL_API,
): Promise<TokenMarket | null> {
  const r = await f(`${base}/networks/${network}/tokens/${token.toLowerCase()}?include=top_pools`, {
    headers: { accept: 'application/json' },
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
  const j = (await r.json()) as {
    data?: {
      attributes?: Record<string, unknown> & { volume_usd?: { h24?: string } }
      relationships?: { top_pools?: { data?: { id: string }[] } }
    }
    included?: { id: string; attributes?: { price_change_percentage?: { h24?: string } } }[]
  }
  const a = j.data?.attributes
  if (!a) return null
  const poolId = j.data?.relationships?.top_pools?.data?.[0]?.id
  const pool = j.included?.find((p) => p.id === poolId)
  return {
    source: 'geckoterminal',
    priceUsd: num(a.price_usd),
    change24hPct: num(pool?.attributes?.price_change_percentage?.h24),
    fdvUsd: num(a.fdv_usd),
    marketCapUsd: num(a.market_cap_usd),
    volume24hUsd: num(a.volume_usd?.h24),
    liquidityUsd: num(a.total_reserve_in_usd),
    topPool: poolId?.split('_')[1],
    imageUrl: typeof a.image_url === 'string' && a.image_url !== 'missing.png' ? a.image_url : undefined,
    fetchedAt: Date.now(),
  }
}

export async function fetchTokenPrices(
  network: string,
  tokens: Address[],
  f: Fetch = fetch,
  base = GECKOTERMINAL_API,
): Promise<Record<string, { priceUsd: number | null; change24hPct: number | null }>> {
  if (!tokens.length) return {}
  const list = tokens.map((t) => t.toLowerCase()).join(',')
  const r = await f(`${base}/simple/networks/${network}/token_price/${list}?include_24hr_price_change=true`, {
    headers: { accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
  const j = (await r.json()) as {
    data?: { attributes?: { token_prices?: Record<string, string>; h24_price_change_percentage?: Record<string, string> } }
  }
  const prices = j.data?.attributes?.token_prices ?? {}
  const changes = j.data?.attributes?.h24_price_change_percentage ?? {}
  const out: Record<string, { priceUsd: number | null; change24hPct: number | null }> = {}
  for (const t of tokens) {
    const k = t.toLowerCase()
    out[k] = { priceUsd: num(prices[k]), change24hPct: num(changes[k]) }
  }
  return out
}

export type ChartRange = '24h' | '7d' | '30d' | '90d' | 'all'

export const RANGE_QUERY: Record<ChartRange, { timeframe: 'minute' | 'hour' | 'day'; aggregate: number; limit: number }> = {
  '24h': { timeframe: 'minute', aggregate: 15, limit: 96 },
  '7d': { timeframe: 'hour', aggregate: 4, limit: 42 },
  '30d': { timeframe: 'hour', aggregate: 12, limit: 60 },
  '90d': { timeframe: 'day', aggregate: 1, limit: 90 },
  all: { timeframe: 'day', aggregate: 1, limit: 1000 },
}

export interface PricePoint {
  t: number // unix seconds
  close: number
}

/** Historical USD close prices for `token` from one of its pools. */
export async function fetchPriceHistory(
  network: string,
  /** Pool address (20 bytes) or pool id (32 bytes, e.g. Uniswap v4). */
  pool: string,
  token: Address,
  range: ChartRange,
  f: Fetch = fetch,
  base = GECKOTERMINAL_API,
): Promise<PricePoint[]> {
  const q = RANGE_QUERY[range]
  const r = await f(
    `${base}/networks/${network}/pools/${pool.toLowerCase()}/ohlcv/${q.timeframe}?aggregate=${q.aggregate}&limit=${q.limit}&currency=usd&token=${token.toLowerCase()}`,
    { headers: { accept: 'application/json' } },
  )
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
  const j = (await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } }
  return (j.data?.attributes?.ohlcv_list ?? [])
    .map((row) => ({ t: row[0]!, close: row[4]! }))
    .filter((p) => Number.isFinite(p.close))
    .sort((a, b) => a.t - b.t)
}

/**
 * Value of the user's *current* holdings over time, priced at historical
 * closes. This is explicitly labelled in the UI — it is not a reconstruction
 * of historical balances.
 */
export function holdingsValueSeries(series: { amount: number; prices: PricePoint[] }[]): PricePoint[] {
  const times = new Set<number>()
  for (const s of series) for (const p of s.prices) times.add(p.t)
  const sorted = [...times].sort((a, b) => a - b)
  return sorted.map((t) => {
    let v = 0
    for (const s of series) {
      // last known price at or before t
      let price: number | undefined
      for (const p of s.prices) {
        if (p.t <= t) price = p.close
        else break
      }
      if (price !== undefined) v += price * s.amount
    }
    return { t, close: v }
  })
}

/**
 * Re-express a USD value series in another asset (e.g. $WIF): each point is divided by that
 * asset's last known USD price at or before the point's time. Points earlier than the first
 * known price are dropped rather than estimated.
 */
export function denominateSeries(valuesUsd: PricePoint[], assetPricesUsd: PricePoint[]): PricePoint[] {
  const prices = [...assetPricesUsd].filter((p) => p.close > 0).sort((a, b) => a.t - b.t)
  const out: PricePoint[] = []
  let j = -1
  for (const v of [...valuesUsd].sort((a, b) => a.t - b.t)) {
    while (j + 1 < prices.length && prices[j + 1]!.t <= v.t) j++
    if (j >= 0) out.push({ t: v.t, close: v.close / prices[j]!.close })
  }
  return out
}

// ---------------------------------------------------------------- live market (pool trades + stats)

export interface PoolTrade {
  txHash: string
  blockNumber: number
  timestamp: number
  kind: 'buy' | 'sell'
  /** Amount of the pool's base token (e.g. WIF) bought or sold. */
  baseAmount: number
  /** Amount of the quote token (e.g. ETH) paid or received. */
  quoteAmount: number
  volumeUsd: number
  trader: string
}

export interface PoolWindowStats {
  buys: number
  sells: number
  buyers: number | null
  sellers: number | null
  volumeUsd: number | null
  priceChangePct: number | null
}

export interface PoolStats {
  source: 'geckoterminal'
  name: string
  priceUsd: number | null
  liquidityUsd: number | null
  fdvUsd: number | null
  windows: Record<'m5' | 'h1' | 'h6' | 'h24', PoolWindowStats>
  fetchedAt: number
}

/** Recent trades in a pool, newest first (GeckoTerminal keeps roughly the last 24 hours). */
export async function fetchPoolTrades(network: string, pool: string, f: Fetch = fetch, base = GECKOTERMINAL_API): Promise<PoolTrade[]> {
  const r = await f(`${base}/networks/${network}/pools/${pool.toLowerCase()}/trades`, { headers: { accept: 'application/json' } })
  if (r.status === 404) return []
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
  const j = (await r.json()) as { data?: { attributes?: Record<string, unknown> }[] }
  return parsePoolTrades(j)
}

export function parsePoolTrades(j: { data?: { attributes?: Record<string, unknown> }[] }): PoolTrade[] {
  const out: PoolTrade[] = []
  for (const d of j.data ?? []) {
    const a = d.attributes ?? {}
    const kind = a.kind === 'buy' || a.kind === 'sell' ? a.kind : null
    const ts = Date.parse(String(a.block_timestamp ?? ''))
    const from = num(a.from_token_amount)
    const to = num(a.to_token_amount)
    const vol = num(a.volume_in_usd)
    if (!kind || !Number.isFinite(ts) || from === null || to === null || vol === null) continue
    out.push({
      txHash: String(a.tx_hash ?? ''),
      blockNumber: Number(a.block_number ?? 0),
      timestamp: ts,
      kind,
      baseAmount: kind === 'buy' ? to : from,
      quoteAmount: kind === 'buy' ? from : to,
      volumeUsd: vol,
      trader: String(a.tx_from_address ?? ''),
    })
  }
  return out.sort((x, y) => y.timestamp - x.timestamp)
}

export async function fetchPoolStats(network: string, pool: string, f: Fetch = fetch, base = GECKOTERMINAL_API): Promise<PoolStats | null> {
  const r = await f(`${base}/networks/${network}/pools/${pool.toLowerCase()}`, { headers: { accept: 'application/json' } })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
  const j = (await r.json()) as { data?: { attributes?: Record<string, unknown> } }
  return parsePoolStats(j)
}

export function parsePoolStats(j: { data?: { attributes?: Record<string, unknown> } }): PoolStats | null {
  const a = j.data?.attributes
  if (!a) return null
  const tx = (a.transactions ?? {}) as Record<string, Record<string, unknown> | undefined>
  const vol = (a.volume_usd ?? {}) as Record<string, unknown>
  const chg = (a.price_change_percentage ?? {}) as Record<string, unknown>
  const win = (k: 'm5' | 'h1' | 'h6' | 'h24'): PoolWindowStats => ({
    buys: num(tx[k]?.buys) ?? 0,
    sells: num(tx[k]?.sells) ?? 0,
    buyers: num(tx[k]?.buyers),
    sellers: num(tx[k]?.sellers),
    volumeUsd: num(vol[k]),
    priceChangePct: num(chg[k]),
  })
  return {
    source: 'geckoterminal',
    name: String(a.name ?? ''),
    priceUsd: num(a.base_token_price_usd),
    liquidityUsd: num(a.reserve_in_usd),
    fdvUsd: num(a.fdv_usd),
    windows: { m5: win('m5'), h1: win('h1'), h6: win('h6'), h24: win('h24') },
    fetchedAt: Date.now(),
  }
}

/** Buy vs sell flow over trades newer than `sinceMs`. `buyShare` is null when there is no volume. */
export function tradeFlow(trades: PoolTrade[], sinceMs: number) {
  let buyUsd = 0
  let sellUsd = 0
  let buys = 0
  let sells = 0
  for (const t of trades) {
    if (t.timestamp < sinceMs) continue
    if (t.kind === 'buy') {
      buyUsd += t.volumeUsd
      buys++
    } else {
      sellUsd += t.volumeUsd
      sells++
    }
  }
  const total = buyUsd + sellUsd
  return { buyUsd, sellUsd, buys, sells, buyShare: total > 0 ? buyUsd / total : null }
}
