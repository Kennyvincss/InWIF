import { SIGNIN_MAX_VAULT_BYTES, isValidVault, verifySigninSignature } from '@inwif/core'
import { logError, rateLimit } from '@/server/guard'
import { claimByAddress } from '@/server/names'
import { putRecord, signinAvailable } from '@/server/signin'
import { json, readBody, unavailable } from '../_shared'

export const dynamic = 'force-dynamic'

/** Turn on sign-in: store the device-encrypted vault + hash of the sign-in key. Signed by the wallet. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, 10)
  if (limited) return limited
  const b = await readBody<{ address?: string; issuedAt?: string; signature?: string; salt?: string; keyHash?: string; vault?: unknown; kind?: string; name?: string; index?: number }>(req, SIGNIN_MAX_VAULT_BYTES + 2_000)
  if (!b) return json({ error: 'Invalid request.' }, 400)
  const v = await verifySigninSignature('enable', String(b.address), String(b.issuedAt), String(b.signature))
  if (!v.ok) return json({ error: v.error }, 400)
  if (!/^[0-9a-f]{32}$/.test(String(b.salt)) || !/^[0-9a-f]{64}$/.test(String(b.keyHash))) return json({ error: 'Invalid sign-in key.' }, 400)
  if (!isValidVault(b.vault)) return json({ error: 'Invalid encrypted wallet.' }, 400)
  if (b.kind !== 'mnemonic' && b.kind !== 'privateKey') return json({ error: 'Invalid wallet type.' }, 400)
  const index = Number(b.index ?? 0)
  if (!Number.isInteger(index) || index < 0 || index > 99) return json({ error: 'Invalid account.' }, 400)
  if (!signinAvailable()) return unavailable()
  try {
    if (!(await claimByAddress(v.address))) return json({ error: 'Claim a username first.' }, 409)
    await putRecord(v.address, { salt: String(b.salt), hash: String(b.keyHash), vault: b.vault, kind: b.kind, index, name: String(b.name ?? 'My wallet').slice(0, 40), updatedAt: Date.now() })
    return json({ ok: true })
  } catch (e) {
    logError('signin', e)
    return unavailable()
  }
}
