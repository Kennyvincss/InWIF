import { NextResponse } from 'next/server'
import { normaliseUsername } from '@inwif/core'
import { logError, rateLimit } from '@/server/guard'
import { claimByName, lookalikeOwner, registryAvailable } from '@/server/names'

export const dynamic = 'force-dynamic'

/**
 * GET /api/names/<name> → { claim } when taken, otherwise { claim: null, available, reason? }.
 * The claim is returned exactly as signed; clients verify it before trusting the address.
 */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const limited = await rateLimit(req)
  if (limited) return limited
  const n = normaliseUsername(decodeURIComponent((await params).name))
  if (!n.ok) return NextResponse.json({ claim: null, available: false, reason: 'invalid', error: n.error })
  if (!registryAvailable()) return NextResponse.json({ error: 'Usernames are unavailable right now.' }, { status: 503 })
  try {
    const claim = await claimByName(n.username)
    if (claim) return NextResponse.json({ claim }, { headers: { 'cache-control': 'no-store' } })
    const owner = await lookalikeOwner(n.username)
    return NextResponse.json(owner ? { claim: null, available: false, reason: 'similar', owner } : { claim: null, available: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    logError('names', e)
    return NextResponse.json({ error: 'Usernames are unavailable right now.' }, { status: 503 })
  }
}
