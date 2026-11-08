import { NextResponse } from 'next/server'
import { POOL_ID_RE, fetchPoolTrades } from '@inwif/core'
import { cached, geckoFetch, logError, rateLimit } from '@/server/guard'

/** Recent trades in one pool (live $WIF terminal). Shared 10s cache keeps upstream calls low. */
export async function GET(req: Request) {
  const limited = await rateLimit(req)
  if (limited) return limited
  const u = new URL(req.url)
  const network = u.searchParams.get('network') ?? ''
  const pool = u.searchParams.get('pool') ?? ''
  if (network !== 'robinhood' || !POOL_ID_RE.test(pool)) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  try {
    const r = await cached(`trades:${network}:${pool.toLowerCase()}`, 10_000, async () => ({ status: 200, body: await fetchPoolTrades(network, pool, geckoFetch) }))
    return NextResponse.json(r.body)
  } catch (e) {
    logError('market/trades', e)
    return NextResponse.json({ error: 'Market data provider unavailable' }, { status: 502 })
  }
}
