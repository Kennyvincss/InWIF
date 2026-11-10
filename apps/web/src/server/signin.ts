import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import type { EncryptedVault } from '@inwif/core'
import { SIGNIN_MAX_FAILURES } from '@inwif/core'
import { pipeline, redis, redisConfigured } from './redis'

/**
 * Sign-in records, one per address:
 *   inwif:acct:<address>      → { salt, hash, vault, kind, name, updatedAt }
 *   inwif:acctfail:<address>  → failed password attempts in the current hour
 * `hash` is SHA-256 of the client-derived sign-in key; `vault` is the wallet encrypted on the
 * user's device. Neither the password nor the secret ever reaches this server.
 * Same storage rule as usernames: Upstash in production, memory only for local runs.
 */
export interface SigninRecord {
  salt: string
  hash: string
  vault: EncryptedVault
  kind: 'mnemonic' | 'privateKey'
  /** Account index inside a recovery-phrase wallet (0 for private-key wallets). */
  index: number
  name: string
  updatedAt: number
}

const mem = new Map<string, { v: string; exp?: number }>()
const useMemory = () => !redisConfigured() && !process.env.VERCEL
export const signinAvailable = () => redisConfigured() || useMemory()
const K = { acct: (a: string) => `inwif:acct:${a.toLowerCase()}`, fail: (a: string) => `inwif:acctfail:${a.toLowerCase()}` }

export async function getRecord(address: string): Promise<SigninRecord | null> {
  const raw = useMemory() ? mem.get(K.acct(address))?.v ?? null : await redis<string | null>(['GET', K.acct(address)])
  try {
    return raw ? (JSON.parse(raw) as SigninRecord) : null
  } catch {
    return null
  }
}

export async function putRecord(address: string, r: SigninRecord) {
  const v = JSON.stringify(r)
  if (useMemory()) mem.set(K.acct(address), { v })
  else await pipeline([['SET', K.acct(address), v], ['DEL', K.fail(address)]])
  if (useMemory()) mem.delete(K.fail(address))
}

export async function deleteRecord(address: string) {
  if (useMemory()) {
    mem.delete(K.acct(address))
    mem.delete(K.fail(address))
  } else await pipeline([['DEL', K.acct(address)], ['DEL', K.fail(address)]])
}

export async function failures(address: string): Promise<number> {
  if (useMemory()) {
    const f = mem.get(K.fail(address))
    return f && (!f.exp || f.exp > Date.now()) ? Number(f.v) : 0
  }
  return Number((await redis<string | null>(['GET', K.fail(address)])) ?? 0)
}

export async function addFailure(address: string): Promise<number> {
  if (useMemory()) {
    const n = (await failures(address)) + 1
    mem.set(K.fail(address), { v: String(n), exp: Date.now() + 3_600_000 })
    return n
  }
  const [n] = await pipeline([['INCR', K.fail(address)], ['EXPIRE', K.fail(address), 3600, 'NX']])
  return Number(n)
}

export async function clearFailures(address: string) {
  if (useMemory()) mem.delete(K.fail(address))
  else await redis(['DEL', K.fail(address)])
}

export const lockedOut = async (address: string) => (await failures(address)) >= SIGNIN_MAX_FAILURES

/** Constant-time comparison of two hex hashes. */
export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === 32 && y.length === 32 && timingSafeEqual(x, y)
}
