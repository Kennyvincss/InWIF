import { logError, rateLimit } from '@/server/guard'
import { getRecord, signinAvailable } from '@/server/signin'
import { addressForUsername, json, readBody, unavailable } from '../_shared'

export const dynamic = 'force-dynamic'

/** Step 1 of sign-in: the per-account salt for deriving the sign-in key. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, 30)
  if (limited) return limited
  const b = await readBody<{ username?: string }>(req)
  if (!signinAvailable()) return unavailable()
  try {
    const address = await addressForUsername(b?.username)
    const rec = address ? await getRecord(address) : null
    if (!rec) return json({ error: 'No InWIF account signs in with that username. Check the spelling, or create or import your wallet.' }, 404)
    return json({ salt: rec.salt })
  } catch (e) {
    logError('signin', e)
    return unavailable()
  }
}
