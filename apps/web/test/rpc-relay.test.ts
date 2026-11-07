import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const DWELLIR = 'https://api-robinhood-mainnet-archive.n.dwellir.com'
const PUBLIC = 'https://rpc.mainnet.chain.robinhood.com'

type Call = { url: string; headers: Record<string, string> }
let calls: Call[] = []

function mockFetch(responder: (url: string) => Response) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> })
    return responder(url)
  })
}

async function relay(body: unknown, ip = `10.0.0.${Math.floor(Math.random() * 250)}`) {
  const { POST } = await import('@/app/api/rpc/[network]/route')
  const req = new Request('http://localhost/api/rpc/robinhood', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': ip } })
  return POST(req, { params: Promise.resolve({ network: 'robinhood' }) })
}

const ok = (result: string) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 })

describe('/api/rpc relay with Dwellir', () => {
  beforeEach(() => {
    calls = []
    vi.stubEnv('DWELLIR_API_KEY', 'server-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends reads to Dwellir with the key as a header, not in the URL', async () => {
    mockFetch(() => ok('0x1237'))
    const r = await relay({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    expect(await r.json()).toMatchObject({ result: '0x1237' })
    expect(calls[0]!.url).toBe(DWELLIR)
    expect(calls[0]!.headers['X-Api-Key']).toBe('server-secret')
    expect(r.headers.get('x-inwif-upstream')).toBe('managed')
  })

  it('routes eth_getLogs straight to the public RPC', async () => {
    mockFetch(() => ok('0x'))
    await relay({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{}] })
    expect(calls.map((c) => c.url)).toEqual([PUBLIC])
    expect(calls[0]!.headers['X-Api-Key']).toBeUndefined()
  })

  it("fails over to the public RPC when Dwellir answers with a plan-limit message", async () => {
    mockFetch((url) => (url === DWELLIR ? new Response('Your current plan does not support this method.', { status: 200 }) : ok('0x1')))
    const r = await relay({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
    expect(calls.map((c) => c.url)).toEqual([DWELLIR, PUBLIC])
    expect(r.headers.get('x-inwif-upstream')).toBe('public')
  })

  it('passes a genuine execution revert through without failing over', async () => {
    mockFetch(() => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } }), { status: 200 }))
    await relay({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{}, 'latest'] })
    expect(calls.map((c) => c.url)).toEqual([DWELLIR])
  })

  it('uses only public RPCs when no key is configured', async () => {
    vi.stubEnv('DWELLIR_API_KEY', '')
    mockFetch(() => ok('0x1237'))
    await relay({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    expect(calls.map((c) => c.url)).toEqual([PUBLIC])
  })

  it('still refuses methods outside the allow-list', async () => {
    mockFetch(() => ok('0x'))
    const r = await relay({ jsonrpc: '2.0', id: 1, method: 'eth_accounts', params: [] })
    expect(r.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('relays transaction hashes and log topics (32-byte hex), but never recovery phrases or key fields', async () => {
    mockFetch(() => ok('0x1'))
    const hash = '0x394da5a9bdf42ca3f73af80fd2c90cf5b98912f988c2442a960d54d1cfa2064a'
    expect((await relay({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] })).status).toBe(200)
    const topic = '0x000000000000000000000000156064f872eb6dedc953e7af21e7a7991910ef09'
    expect((await relay({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ topics: [hash, topic, null] }] })).status).toBe(200)
    const phrase = 'test test test test test test test test test test test junk'
    expect((await relay({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ data: phrase }] })).status).toBe(400)
    expect((await relay({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ privateKey: '0x1' }] })).status).toBe(400)
  })

  it('counts every call in a batch against the rate limit', async () => {
    mockFetch(() => ok('0x1'))
    const batch = Array.from({ length: 20 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_chainId', params: [] }))
    const ip = '192.0.2.77'
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) statuses.push((await relay(batch, ip)).status)
    expect(statuses.slice(0, 30).every((x) => x === 200)).toBe(true) // 30 × 20 = 600 calls
    expect(statuses[30]).toBe(429)
  })
})
