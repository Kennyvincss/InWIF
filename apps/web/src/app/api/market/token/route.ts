import { NextResponse } from 'next/server'
import { fetchTokenMarket } from '@inwif/core'
import { ADDRESS_RE, cached, geckoFetch, logError, rateLimit } from '@/server/guard'

export async function GET(req: Request) {
  const limited = await rateLimit(req)
  if (limited) return limited
  const u = new URL(req.url)
  const network = u.searchParams.get('network') ?? ''
  const address = u.searchParams.get('address') ?? ''
  if (network !== 'robinhood' || !ADDRESS_RE.test(address)) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  try {
    const r = await cached<unknown>(`token:${network}:${address.toLowerCase()}`, 300_000, async () => {
      const m = await fetchTokenMarket(network, address as `0x${string}`, geckoFetch)
      return m ? { status: 200, body: m } : { status: 404, body: { error: 'No market for this token' } }
    })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    logError('market/token', e)
    return NextResponse.json({ error: 'Market data provider unavailable' }, { status: 502 })
  }
}
