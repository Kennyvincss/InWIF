/** Public status check. Reports only whether shared storage works — never names, URLs or keys. */
import { NextResponse } from 'next/server'
import { rateLimit } from '@/server/guard'
import { redis, redisConfigured } from '@/server/redis'

export const dynamic = 'force-dynamic'

let last: { at: number; redis: 'connected' | 'not configured' | 'unreachable' } | null = null

export async function GET(req: Request) {
  const limited = await rateLimit(req, 30)
  if (limited) return limited
  if (!last || Date.now() - last.at > 60_000) {
    let state: 'connected' | 'not configured' | 'unreachable' = 'not configured'
    if (redisConfigured()) state = await redis(['PING']).then((r) => (r === 'PONG' ? 'connected' : 'unreachable'), () => 'unreachable' as const)
    last = { at: Date.now(), redis: state }
  }
  return NextResponse.json({ ok: true, sharedLimitsAndCache: last.redis }, { headers: { 'cache-control': 'no-store' } })
}
