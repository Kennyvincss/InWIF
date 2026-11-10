import { ADDRESS_RE, logError, rateLimit } from '@/server/guard'
import { getRecord, signinAvailable } from '@/server/signin'
import { json, unavailable } from '../_shared'

export const dynamic = 'force-dynamic'

/** Whether sign-in is on for an address (no secrets returned). */
export async function GET(req: Request) {
  const limited = await rateLimit(req)
  if (limited) return limited
  const address = new URL(req.url).searchParams.get('address') ?? ''
  if (!ADDRESS_RE.test(address)) return json({ error: 'Invalid address.' }, 400)
  if (!signinAvailable()) return unavailable()
  try {
    const rec = await getRecord(address)
    return json({ enabled: !!rec, updatedAt: rec?.updatedAt ?? null })
  } catch (e) {
    logError('signin', e)
    return unavailable()
  }
}
