import { NextResponse } from 'next/server'
import { RANGE_QUERY, fetchPriceHistory, type ChartRange } from '@inwif/core'
import { ADDRESS_RE, cached, logError, rateLimit } from '@/server/guard'

export async function GET(req: Request) {
  const limited = rateLimit(req)
  if (limited) return limited
  const u = new URL(req.url)
  const network = u.searchParams.get('network') ?? ''
  const pool = u.searchParams.get('pool') ?? ''
  const token = u.searchParams.get('token') ?? ''
  const range = (u.searchParams.get('range') ?? '7d') as ChartRange
  if (network !== 'robinhood' || !ADDRESS_RE.test(pool) || !ADDRESS_RE.test(token) || !(range in RANGE_QUERY))
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  try {
    const r = await cached(`ohlcv:${pool}:${token}:${range}`.toLowerCase(), 300_000, async () => ({
      status: 200,
      body: await fetchPriceHistory(network, pool as `0x${string}`, token as `0x${string}`, range),
    }))
    return NextResponse.json(r.body)
  } catch (e) {
    logError('market/ohlcv', e)
    return NextResponse.json({ error: 'Market data provider unavailable' }, { status: 502 })
  }
}
