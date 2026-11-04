import 'server-only'
import { NextResponse } from 'next/server'
import { redact } from '@inwif/core'

/** Tiny in-memory token bucket per client IP. Suitable for a single instance; use Redis behind a load balancer. */
const buckets = new Map<string, { tokens: number; at: number }>()

export function rateLimit(req: Request, perMinute = 120): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
  const now = Date.now()
  const b = buckets.get(ip) ?? { tokens: perMinute, at: now }
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute)
  b.at = now
  if (b.tokens < 1) {
    buckets.set(ip, b)
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'retry-after': '10' } })
  }
  b.tokens -= 1
  buckets.set(ip, b)
  if (buckets.size > 10_000) buckets.clear()
  return null
}

const cache = new Map<string, { at: number; body: unknown; status: number }>()

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<{ status: number; body: T }>) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return { status: hit.status, body: hit.body as T }
  const res = await fn()
  if (res.status < 500) cache.set(key, { at: Date.now(), ...res })
  if (cache.size > 2_000) cache.clear()
  return res
}

export function logError(scope: string, err: unknown) {
  // Never log request bodies; redact anything secret-shaped from messages.
  console.error(`[${scope}]`, redact(String((err as Error)?.message ?? err)))
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
