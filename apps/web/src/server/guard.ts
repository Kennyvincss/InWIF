import 'server-only'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { redact } from '@inwif/core'
import { pipeline, redis, redisConfigured } from './redis'

/**
 * Rate limiting in two layers:
 *  1. A per-instance token bucket (instant, no network).
 *  2. When Upstash Redis is configured, a shared per-minute counter across all server
 *     instances. Each instance adds up usage locally and syncs it in batches (every
 *     FLUSH_COST units or FLUSH_MS), so most requests make no Redis call at all and the
 *     free tier's command quota lasts. If Redis is unreachable, layer 1 still applies.
 */
const buckets = new Map<string, { tokens: number; at: number }>()
const MAX_TRACKED = 10_000

interface SharedUsage {
  minute: number
  pending: number
  flushedAt: number
  blockedUntil: number
}
const shared = new Map<string, SharedUsage>()
const FLUSH_COST = 25
const FLUSH_MS = 10_000

const tooMany = () => NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'retry-after': '10' } })

function touch<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key)
  map.set(key, value) // re-insert so the Map stays ordered by last use
  // Evict the least recently seen clients; never reset everyone's limits at once.
  while (map.size > MAX_TRACKED) map.delete(map.keys().next().value!)
}

export function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}

/** Charge `cost` units (e.g. one per call in a JSON-RPC batch) against `perMinute` for this client. */
export async function rateLimit(req: Request, perMinute = 120, cost = 1): Promise<NextResponse | null> {
  const key = `${perMinute}:${clientIp(req)}`
  const now = Date.now()

  // Layer 1: this instance.
  const b = buckets.get(key) ?? { tokens: perMinute, at: now }
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute)
  b.at = now
  if (b.tokens < cost) {
    buckets.set(key, b)
    return tooMany()
  }
  b.tokens -= cost
  touch(buckets, key, b)

  // Layer 2: all instances.
  if (!redisConfigured()) return null
  const minute = Math.floor(now / 60_000)
  let u = shared.get(key)
  if (!u || u.minute !== minute) u = { minute, pending: 0, flushedAt: now, blockedUntil: u?.blockedUntil ?? 0 }
  if (u.blockedUntil > now) {
    touch(shared, key, u)
    return tooMany()
  }
  u.pending += cost
  touch(shared, key, u)
  if (u.pending < FLUSH_COST && now - u.flushedAt < FLUSH_MS) return null
  const n = u.pending
  u.pending = 0
  u.flushedAt = now
  try {
    const rkey = `inwif:rl:${key}:${minute}`
    const [total] = await pipeline([
      ['INCRBY', rkey, n],
      ['EXPIRE', rkey, 120],
    ])
    if (Number(total) > perMinute) {
      u.blockedUntil = (minute + 1) * 60_000
      return tooMany()
    }
  } catch (e) {
    logError('ratelimit', e) // Redis unavailable: layer 1 still protects this instance.
  }
  return null
}

interface CacheEntry {
  at: number
  body: unknown
  status: number
}
const cache = new Map<string, CacheEntry>()
const STALE_MAX_MS = 60 * 60_000
const SHARED_MAX_BYTES = 256_000

const sharedKey = (key: string) => `inwif:c:${createHash('sha256').update(key).digest('hex').slice(0, 40)}`

async function sharedGet(key: string): Promise<CacheEntry | null> {
  if (!redisConfigured()) return null
  try {
    const v = await redis<string | null>(['GET', sharedKey(key)])
    return v ? (JSON.parse(v) as CacheEntry) : null
  } catch (e) {
    logError('cache', e)
    return null
  }
}

async function sharedSet(key: string, entry: CacheEntry) {
  if (!redisConfigured()) return
  const json = JSON.stringify(entry)
  if (json.length > SHARED_MAX_BYTES) return
  try {
    await redis(['SET', sharedKey(key), json, 'EX', Math.ceil(STALE_MAX_MS / 1000)])
  } catch (e) {
    logError('cache', e)
  }
}

/**
 * Response cache: this instance's memory first, then the shared Redis cache (when
 * configured), so every instance benefits from one upstream call. Fresh entries are
 * served for `ttlMs`; if the upstream then fails or rate-limits us, the last good
 * response (up to 1h old) is served instead of an error. Clients see real, slightly
 * older data — never invented data.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<{ status: number; body: T }>) {
  const now = Date.now()
  let hit = cache.get(key)
  if (hit && now - hit.at < ttlMs) return { status: hit.status, body: hit.body as T }
  const remote = await sharedGet(key)
  if (remote && (!hit || remote.at > hit.at)) {
    hit = remote
    touch(cache, key, remote)
    if (now - remote.at < ttlMs) return { status: remote.status, body: remote.body as T }
  }
  const stale = () => (hit && Date.now() - hit.at < STALE_MAX_MS ? { status: hit.status, body: hit.body as T } : null)
  try {
    const res = await fn()
    if (res.status < 400 || res.status === 404) {
      const entry = { at: Date.now(), ...res }
      touch(cache, key, entry)
      while (cache.size > 2_000) cache.delete(cache.keys().next().value!)
      await sharedSet(key, entry)
      return res
    }
    return stale() ?? res
  } catch (e) {
    const s = stale()
    if (s) return s
    throw e
  }
}

/**
 * Paced fetch for rate-limited public APIs (GeckoTerminal allows ~30 req/min).
 * Requests are queued at least `intervalMs` apart; a 429 is retried once after a pause.
 */
export function pacedFetch(intervalMs: number): typeof fetch {
  let next = 0
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const paced: typeof fetch = async (input, init) => {
    const now = Date.now()
    const slot = Math.max(now, next)
    next = slot + intervalMs
    if (slot > now) await wait(slot - now)
    const res = await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) })
    if (res.status !== 429) return res
    await wait(Math.max(intervalMs, Number(res.headers.get('retry-after') ?? 0) * 1000 || 3_000))
    return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) })
  }
  return paced
}

/** Shared pacing for all GeckoTerminal calls made by this server. */
export const geckoFetch = pacedFetch(2_100)

export function logError(scope: string, err: unknown) {
  // Never log request bodies; redact anything secret-shaped from messages.
  console.error(`[${scope}]`, redact(String((err as Error)?.message ?? err)))
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
