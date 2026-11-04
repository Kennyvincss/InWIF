import { NextResponse } from 'next/server'
import { fetchTokenPrices } from '@inwif/core'
import { ADDRESS_RE, cached, logError, rateLimit } from '@/server/guard'

const NETWORKS = new Set(['robinhood'])

export async function GET(req: Request) {
  const limited = rateLimit(req)
  if (limited) return limited
  const u = new URL(req.url)
  const network = u.searchParams.get('network') ?? ''
  const tokens = (u.searchParams.get('tokens') ?? '').split(',').filter(Boolean)
  if (!NETWORKS.has(network) || !tokens.length || tokens.length > 30 || !tokens.every((t) => ADDRESS_RE.test(t)))
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  try {
    const key = `prices:${network}:${tokens.map((t) => t.toLowerCase()).sort().join(',')}`
    const r = await cached(key, 60_000, async () => ({ status: 200, body: await fetchTokenPrices(network, tokens as `0x${string}`[]) }))
    return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'public, max-age=30' } })
  } catch (e) {
    logError('market/prices', e)
    return NextResponse.json({ error: 'Market data provider unavailable' }, { status: 502 })
  }
}
