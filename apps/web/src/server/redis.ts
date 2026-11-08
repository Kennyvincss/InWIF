import 'server-only'

/**
 * Minimal Upstash Redis client over its REST API (no extra dependency).
 *
 * Configured by the Vercel ↔ Upstash integration. Depending on how it was connected the
 * variables are named UPSTASH_REDIS_REST_* or KV_REST_API_*; both are accepted.
 * Every call has a short timeout and callers treat errors as "Redis unavailable" and fall
 * back to per-instance memory, so Redis can never take the site down.
 */
type Cmd = (string | number)[]

function config() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim().replace(/\/+$/, '')
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? { url, token } : null
}

export const redisConfigured = () => config() !== null

async function call<T>(path: string, body: unknown): Promise<T> {
  const c = config()
  if (!c) throw new Error('Redis is not configured')
  const r = await fetch(`${c.url}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1_500),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`)
  return (await r.json()) as T
}

/** One command, e.g. redis(['GET', key]). */
export async function redis<T = unknown>(cmd: Cmd): Promise<T> {
  const out = await call<{ result?: T; error?: string }>('', cmd)
  if (out.error) throw new Error(`Redis: ${out.error}`)
  return out.result as T
}

/** Several commands in one round trip. */
export async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  const out = await call<{ result?: unknown; error?: string }[]>('/pipeline', cmds)
  return out.map((o) => {
    if (o.error) throw new Error(`Redis: ${o.error}`)
    return o.result
  })
}
