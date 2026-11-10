import { SIGNIN_MAX_FAILURES } from '@inwif/core'
import { createHash } from 'node:crypto'
import { logError, rateLimit } from '@/server/guard'
import { claimByAddress } from '@/server/names'
import { addFailure, clearFailures, getRecord, lockedOut, sameHash, signinAvailable } from '@/server/signin'
import { addressForUsername, json, readBody, unavailable } from '../_shared'

export const dynamic = 'force-dynamic'

/**
 * Step 2 of sign-in: prove the password with the sign-in key and receive the encrypted
 * wallet. Wrong keys count towards an hourly lockout per account; the IP is rate-limited too.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, 10)
  if (limited) return limited
  const b = await readBody<{ username?: string; signinKey?: string }>(req)
  if (!b || !/^[0-9a-f]{64}$/.test(String(b.signinKey))) return json({ error: 'Invalid request.' }, 400)
  if (!signinAvailable()) return unavailable()
  try {
    const address = await addressForUsername(b.username)
    const rec = address ? await getRecord(address) : null
    if (!address || !rec) return json({ error: 'No InWIF account signs in with that username.' }, 404)
    if (await lockedOut(address)) return json({ error: 'Too many wrong passwords. Sign-in for this username is paused for an hour.' }, 429)
    const hash = createHash('sha256').update(Buffer.from(String(b.signinKey), 'hex')).digest('hex')
    if (!sameHash(hash, rec.hash)) {
      const n = await addFailure(address)
      const left = Math.max(0, SIGNIN_MAX_FAILURES - n)
      return json({ error: left > 0 ? `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left before sign-in pauses for an hour.` : 'Too many wrong passwords. Sign-in for this username is paused for an hour.' }, left > 0 ? 401 : 429)
    }
    await clearFailures(address)
    const claim = await claimByAddress(address)
    return json({ address, kind: rec.kind, index: rec.index ?? 0, name: rec.name, vault: rec.vault, username: claim?.username ?? null })
  } catch (e) {
    logError('signin', e)
    return unavailable()
  }
}
