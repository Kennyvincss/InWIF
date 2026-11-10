import { verifySigninSignature } from '@inwif/core'
import { logError, rateLimit } from '@/server/guard'
import { deleteRecord, signinAvailable } from '@/server/signin'
import { json, readBody, unavailable } from '../_shared'

export const dynamic = 'force-dynamic'

/** Turn off sign-in and delete the encrypted wallet. Signed by the wallet. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, 10)
  if (limited) return limited
  const b = await readBody<{ address?: string; issuedAt?: string; signature?: string }>(req)
  if (!b) return json({ error: 'Invalid request.' }, 400)
  const v = await verifySigninSignature('disable', String(b.address), String(b.issuedAt), String(b.signature))
  if (!v.ok) return json({ error: v.error }, 400)
  if (!signinAvailable()) return unavailable()
  try {
    await deleteRecord(v.address)
    return json({ ok: true })
  } catch (e) {
    logError('signin', e)
    return unavailable()
  }
}
