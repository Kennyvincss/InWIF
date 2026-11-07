import 'server-only'
import { NextResponse } from 'next/server'
import { redact } from '@inwif/core'

/** Tiny in-memory token bucket per client IP. Suitable for a single instance; use Redis behind a load balancer. */
const buckets = new Map<string, { tokens: number; at: number }>()

const MAX_TRACKED = 10_000

/** Charge `cost` tokens (e.g. one per call in a JSON-RPC batch). */
export function rateLimit(req: Request, perMinute = 120, cost = 1): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
  const now = Date.now()
  const b = buckets.get(ip) ?? { tokens: perMinute, at: now }
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute)
  b.at = now
  if (b.tokens < cost) {
    buckets.set(ip, b)
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'retry-after': '10' } })
  }
  b.tokens -= cost
  buckets.delete(ip)
  buckets.set(ip, b) // re-insert so the Map stays ordered by last use
  // Evict the least recently seen clients; never reset everyone's limits at once.
  while (buckets.size > MAX_TRACKED) buckets.delete(buckets.keys().next().value!)
  return null
}

const cache = new Map<string, { at: number; body: unknown; status: number }>()
const STALE_MAX_MS = 60 * 60_000

/**
 * Response cache. Fresh entries are served for `ttlMs`; if the upstream then
 * fails or rate-limits us, the last good response (up to 1h old) is served
 * instead of an error. Clients see real, slightly older data — never invented data.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<{ status: number; body: T }>) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return { status: hit.status, body: hit.body as T }
  try {
    const res = await fn()
    if (res.status < 400 || res.status === 404) {
      cache.set(key, { at: Date.now(), ...res })
      if (cache.size > 2_000) cache.delete(cache.keys().next().value!)
      return res
    }
    if (hit && Date.now() - hit.at < STALE_MAX_MS) return { status: hit.status, body: hit.body as T }
    return res
  } catch (e) {
    if (hit && Date.now() - hit.at < STALE_MAX_MS) return { status: hit.status, body: hit.body as T }
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
