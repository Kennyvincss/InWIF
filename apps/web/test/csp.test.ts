import { describe, expect, it, vi } from 'vitest'
import { NETWORKS } from '@inwif/core'

vi.mock('server-only', () => ({}))

describe('content security policy', () => {
  it('lets the browser reach every RPC and explorer the wallet uses, and nothing else on the internet', async () => {
    // @ts-expect-error -- plain JS config file without type declarations
    const { CONNECT_SRC } = (await import('../next.config.mjs')) as { CONNECT_SRC: string[] }
    for (const n of Object.values(NETWORKS)) {
      if (n.key === 'local') continue
      for (const u of [...n.rpcUrls, n.explorer.apiV2 ?? n.explorer.url]) expect(CONNECT_SRC).toContain(new URL(u).origin)
    }
    expect(CONNECT_SRC).not.toContain('https:')
    expect(CONNECT_SRC).not.toContain('wss:')
    // The Dwellir key is used only by the server relay, so the browser never needs that host.
    expect(CONNECT_SRC.some((h: string) => h.includes('dwellir'))).toBe(false)
  })
})

describe('relay rate limit', () => {
  it('charges each call in a batch and evicts old clients instead of resetting everyone', async () => {
    const { rateLimit } = await import('@/server/guard')
    const req = (ip: string) => new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } })
    expect(rateLimit(req('1.1.1.1'), 30, 20)).toBeNull()
    expect(rateLimit(req('1.1.1.1'), 30, 20)?.status).toBe(429)
    // Flooding from 12 000 other addresses must not reset a client that is still active
    // (the old limiter cleared every bucket once it tracked 10 000 addresses).
    for (let i = 0; i < 12_000; i++) {
      rateLimit(req(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`), 30)
      if (i % 1000 === 0) rateLimit(req('1.1.1.1'), 30, 0)
    }
    expect(rateLimit(req('1.1.1.1'), 30, 20)?.status).toBe(429)
  })
})
