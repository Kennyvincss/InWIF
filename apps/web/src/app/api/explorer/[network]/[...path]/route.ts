/** Allow-listed relay to the network's Blockscout REST API v2 (public data only). */
import { NextResponse } from 'next/server'
import { NETWORKS, type NetworkKey } from '@inwif/core'
import { cached, logError, rateLimit } from '@/server/guard'

const A = '0x[0-9a-fA-F]{40}'
const PATTERNS = [
  new RegExp(`^addresses/${A}/transactions$`),
  new RegExp(`^addresses/${A}/token-transfers$`),
  new RegExp(`^tokens/${A}$`),
  new RegExp(`^tokens/${A}/transfers$`),
  new RegExp(`^tokens/${A}/holders$`),
]
const QUERY_KEYS = new Set(['type', 'token', 'block_number', 'index', 'items_count', 'value', 'fee', 'hash', 'filter', 'address_hash'])

export async function GET(req: Request, ctx: { params: Promise<{ network: string; path: string[] }> }) {
  const limited = await rateLimit(req, 300)
  if (limited) return limited
  const { network, path } = await ctx.params
  const cfg = NETWORKS[network as NetworkKey]
  const p = path.join('/')
  if (!cfg?.explorer.apiV2 || !PATTERNS.some((re) => re.test(p))) return NextResponse.json({ error: 'Not allowed' }, { status: 404 })
  const q = new URL(req.url).searchParams
  const out = new URLSearchParams()
  for (const [k, v] of q) if (QUERY_KEYS.has(k) && v.length < 100) out.set(k, v)
  const url = `${cfg.explorer.apiV2}/${p}${out.size ? `?${out}` : ''}`
  try {
    const r = await cached(url, 15_000, async () => {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      if (res.headers.get('cf-mitigated') === 'challenge')
        return { status: 503, body: { error: 'Explorer bot protection blocked the server relay; your browser connects to it directly instead.' } }
      return { status: res.status, body: await res.json().catch(() => ({ error: 'Bad explorer response' })) }
    })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    logError('explorer', e)
    return NextResponse.json({ error: 'Explorer unavailable' }, { status: 502 })
  }
}
