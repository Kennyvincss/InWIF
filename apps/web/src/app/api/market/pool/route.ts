import { NextResponse } from 'next/server'
import { POOL_ID_RE, fetchPoolStats } from '@inwif/core'
import { cached, geckoFetch, logError, rateLimit } from '@/server/guard'

/** Pool statistics: buys/sells, volume and price change by window (live $WIF terminal). */
export async function GET(req: Request) {
  const limited = await rateLimit(req)
  if (limited) return limited
  const u = new URL(req.url)
  const network = u.searchParams.get('network') ?? ''
  const pool = u.searchParams.get('pool') ?? ''
  if (network !== 'robinhood' || !POOL_ID_RE.test(pool)) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  try {
    const r = await cached<unknown>(`pool:${network}:${pool.toLowerCase()}`, 20_000, async () => {
      const s = await fetchPoolStats(network, pool, geckoFetch)
      return s ? { status: 200, body: s } : { status: 404, body: { error: 'No such pool' } }
    })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    logError('market/pool', e)
    return NextResponse.json({ error: 'Market data provider unavailable' }, { status: 502 })
  }
}
