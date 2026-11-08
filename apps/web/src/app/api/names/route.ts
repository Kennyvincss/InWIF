import { NextResponse } from 'next/server'
import { CLAIM_MAX_AGE_MS, CLAIM_REFUSAL_TEXT, verifyUsernameClaim } from '@inwif/core'
import { ADDRESS_RE, logError, rateLimit } from '@/server/guard'
import { claimByAddress, claimsByAddresses, registryAvailable, storeClaim } from '@/server/names'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'cache-control': 'no-store' }
const unavailable = () => NextResponse.json({ error: 'Usernames are unavailable right now.' }, { status: 503, headers: NO_STORE })

/**
 * Reverse lookup: GET /api/names?address=0x… → { claim | null }, or
 * GET /api/names?addresses=0x…,0x… (up to 50) → { claims: (claim | null)[] }.
 * Clients verify every signature themselves.
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req)
  if (limited) return limited
  const many = new URL(req.url).searchParams.get('addresses')
  if (many !== null) {
    const list = [...new Set(many.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean))]
    if (list.length > 50 || !list.every((a) => ADDRESS_RE.test(a))) return NextResponse.json({ error: 'Invalid addresses' }, { status: 400 })
    if (!registryAvailable()) return unavailable()
    try {
      const claims = await claimsByAddresses(list)
      return NextResponse.json({ addresses: list, claims }, { headers: NO_STORE })
    } catch (e) {
      logError('names', e)
      return unavailable()
    }
  }
  const address = new URL(req.url).searchParams.get('address') ?? ''
  if (!ADDRESS_RE.test(address)) return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  if (!registryAvailable()) return unavailable()
  try {
    return NextResponse.json({ claim: await claimByAddress(address) }, { headers: NO_STORE })
  } catch (e) {
    logError('names', e)
    return unavailable()
  }
}

/** Claim a username: POST { claim } signed by the address. Free: no transaction. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, 10)
  if (limited) return limited
  const text = await req.text()
  if (text.length > 2_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  let body: { claim?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const v = await verifyUsernameClaim(body?.claim)
  if (!v.ok) return NextResponse.json({ error: v.error, reason: 'invalid' }, { status: 400 })
  if (Math.abs(Date.now() - Date.parse(v.claim.issuedAt)) > CLAIM_MAX_AGE_MS) {
    return NextResponse.json({ error: CLAIM_REFUSAL_TEXT.stale, reason: 'stale' }, { status: 400 })
  }
  if (!registryAvailable()) return unavailable()
  try {
    const r = await storeClaim(v.claim)
    if (r !== 'ok') return NextResponse.json({ error: CLAIM_REFUSAL_TEXT[r], reason: r }, { status: 409, headers: NO_STORE })
    return NextResponse.json({ claim: v.claim }, { headers: NO_STORE })
  } catch (e) {
    logError('names', e)
    return unavailable()
  }
}
