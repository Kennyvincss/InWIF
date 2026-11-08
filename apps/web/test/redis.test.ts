import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const URL_ = 'https://fake-upstash.example'
let store: Map<string, string>
let commands: string[][]

/** A tiny in-memory stand-in for the Upstash REST API. */
function fakeUpstash() {
  const exec = (cmd: string[]) => {
    commands.push(cmd)
    const [op, k, ...rest] = cmd.map(String)
    switch (op) {
      case 'GET':
        return store.get(k!) ?? null
      case 'SET':
        store.set(k!, rest[0]!)
        return 'OK'
      case 'INCRBY': {
        const v = Number(store.get(k!) ?? 0) + Number(rest[0])
        store.set(k!, String(v))
        return v
      }
      case 'EXPIRE':
        return 1
      case 'PING':
        return 'PONG'
      default:
        throw new Error(`unexpected ${op}`)
    }
  }
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (!url.startsWith(URL_)) throw new Error(`unexpected fetch ${url}`)
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-token')
    const body = JSON.parse(String(init.body))
    if (url.endsWith('/pipeline')) return new Response(JSON.stringify(body.map((c: string[]) => ({ result: exec(c) }))))
    return new Response(JSON.stringify({ result: exec(body) }))
  })
}

/** A fresh copy of the guard module = a separate server instance with empty memory. */
async function instance() {
  vi.resetModules()
  return import('@/server/guard')
}
const req = (ip: string) => new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } })

describe('shared limits and cache with Upstash Redis', () => {
  beforeEach(() => {
    store = new Map()
    commands = []
    vi.stubEnv('KV_REST_API_URL', URL_)
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token')
    fakeUpstash()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('enforces one limit across server instances, with few Redis commands', async () => {
    const a = await instance()
    const b = await instance()
    // 4 instances' worth of traffic split across two instances: each stays under its own
    // 600/min bucket, but together they pass 600 and get blocked.
    let blocked = 0
    for (let i = 0; i < 400; i++) {
      if (await a.rateLimit(req('203.0.113.5'), 600)) blocked++
      if (await b.rateLimit(req('203.0.113.5'), 600)) blocked++
    }
    expect(blocked).toBeGreaterThan(150)
    // Usage is synced in batches: far fewer commands than requests.
    expect(commands.length).toBeLessThan(80)
  })

  it('shares cached responses between instances', async () => {
    const a = await instance()
    const upstream = vi.fn(async () => ({ status: 200, body: { price: 1.23 } }))
    expect((await a.cached('prices:x', 60_000, upstream)).body).toEqual({ price: 1.23 })
    const b = await instance()
    expect((await b.cached('prices:x', 60_000, upstream)).body).toEqual({ price: 1.23 })
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('keeps working on per-instance memory when Redis is down', async () => {
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }))
    const a = await instance()
    expect(await a.rateLimit(req('198.51.100.9'), 600)).toBeNull()
    const upstream = vi.fn(async () => ({ status: 200, body: 1 }))
    expect((await a.cached('k', 60_000, upstream)).body).toBe(1)
    expect((await a.cached('k', 60_000, upstream)).body).toBe(1)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe('/api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  it('reports whether Redis is connected, without revealing its address or token', async () => {
    store = new Map()
    commands = []
    vi.stubEnv('KV_REST_API_URL', URL_)
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token')
    fakeUpstash()
    vi.resetModules()
    const { GET } = await import('@/app/api/health/route')
    const res = await GET(req('192.0.2.1'))
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: true, sharedLimitsAndCache: 'connected' })
    expect(text).not.toContain('fake-upstash')
    expect(text).not.toContain('test-token')
  })
})
