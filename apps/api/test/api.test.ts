import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { privateKeyToAccount } from 'viem/accounts'
import type { PublicClient } from 'viem'
import { buildApp } from '../src/app'
import { migrate } from '../src/db/migrate'

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://inwif:inwif-dev@127.0.0.1:5432/inwif_test'
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const PHRASE = 'test test test test test test test test test test test junk'

let pool: pg.Pool
let dbAvailable = true

const mockClient = (chainId = 4663) =>
  ({
    getChainId: async () => chainId,
    getBlockNumber: async () => 100n,
    getBalance: async () => 5n * 10n ** 17n,
    readContract: async ({ functionName }: { functionName: string }) => (functionName === 'balanceOf' ? 42n : 0n),
    getLogs: async () => [],
    getCode: async () => '0x60',
  }) as unknown as PublicClient

async function app(opts: { chainId?: number; rateLimitMax?: number } = {}) {
  return buildApp({ db: pool, clientFor: () => mockClient(opts.chainId), rateLimitMax: opts.rateLimitMax ?? 1000 })
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: URL })
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    await migrate(pool)
  } catch {
    dbAvailable = false
  }
})
afterAll(async () => pool?.end())

async function login(a: Awaited<ReturnType<typeof app>>) {
  const c = await a.inject({ method: 'POST', url: '/api/auth/challenge', payload: { address: account.address } })
  const { nonce, message } = c.json()
  const signature = await account.signMessage({ message })
  const v = await a.inject({ method: 'POST', url: '/api/auth/verify', payload: { address: account.address, nonce, signature } })
  return { res: v, nonce, signature }
}

describe('InWIF API', () => {
  it('database is reachable (tests below need PostgreSQL)', () => expect(dbAvailable).toBe(true))

  it('reports the free policy', async () => {
    const a = await app()
    const r = await a.inject('/api/health')
    expect(r.json().policy).toEqual({ free: true, subscriptions: false, serviceFeeBps: 0, wifRequiredForFeatures: false })
  })

  it('signs in with a wallet signature; nonces are single-use', async () => {
    const a = await app()
    const { res, nonce, signature } = await login(a)
    expect(res.statusCode).toBe(200)
    const token = res.json().token as string
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const replay = await a.inject({ method: 'POST', url: '/api/auth/verify', payload: { address: account.address, nonce, signature } })
    expect(replay.statusCode).toBe(401)
    const me = await a.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } })
    expect(me.json().wallets[0].address).toBe(account.address.toLowerCase())
    // token is stored only as a hash
    const raw = await pool.query('SELECT token_hash FROM sessions')
    expect(raw.rows.some((r) => r.token_hash === token)).toBe(false)
  })

  it('rejects a signature from a different key', async () => {
    const a = await app()
    const c = (await a.inject({ method: 'POST', url: '/api/auth/challenge', payload: { address: account.address } })).json()
    const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
    const signature = await other.signMessage({ message: c.message })
    const r = await a.inject({ method: 'POST', url: '/api/auth/verify', payload: { address: account.address, nonce: c.nonce, signature } })
    expect(r.statusCode).toBe(401)
  })

  it('never accepts private keys or recovery phrases', async () => {
    const a = await app()
    const cases = [
      { method: 'POST' as const, url: '/api/auth/challenge', payload: { address: account.address, privateKey: 'x' } },
      { method: 'POST' as const, url: '/api/auth/challenge', payload: { address: account.address, note: PHRASE } },
      { method: 'POST' as const, url: '/api/auth/challenge', payload: { address: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' } },
      { method: 'GET' as const, url: `/api/wallet/balances?address=${account.address}&mnemonic=abc` },
    ]
    for (const c of cases) {
      const r = await a.inject(c)
      expect(r.statusCode).toBe(400)
      expect(r.json().error).toMatch(/never accepts/)
    }
  })

  it('registers devices with public metadata only', async () => {
    const a = await app()
    const token = (await login(a)).res.json().token
    const h = { authorization: `Bearer ${token}` }
    expect((await a.inject({ url: '/api/devices' })).statusCode).toBe(401)
    const ok = await a.inject({ method: 'POST', url: '/api/devices/connect', headers: h, payload: { deviceIdentifier: 'IWSIM-ABCD1234', model: 'InWIF One (simulator)', firmwareVersion: '0.1.0-sim', transport: 'simulator', simulated: true } })
    expect(ok.statusCode).toBe(200)
    await a.inject({ method: 'POST', url: '/api/devices/connect', headers: h, payload: { deviceIdentifier: 'IWSIM-ABCD1234', model: 'InWIF One (simulator)', firmwareVersion: '0.2.0-sim', transport: 'simulator', simulated: true } })
    const list = (await a.inject({ url: '/api/devices', headers: h })).json().devices
    expect(list).toHaveLength(1)
    expect(list[0].firmware_version).toBe('0.2.0-sim')
    expect(list[0].connections).toBe(2)
    const extra = await a.inject({ method: 'POST', url: '/api/devices/connect', headers: h, payload: { deviceIdentifier: 'IWSIM-X1', model: 'm', firmwareVersion: '1', transport: 'usb', pin: '123456' } })
    expect(extra.statusCode).toBe(400)
  })

  it('serves balances from the chain and validates input', async () => {
    const a = await app()
    const r = await a.inject(`/api/wallet/balances?address=${account.address}`)
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.chainId).toBe(4663)
    expect(body.balances[0]).toMatchObject({ token: 'native', raw: '500000000000000000' })
    expect((await a.inject('/api/wallet/balances?address=0x123')).statusCode).toBe(400)
  })

  it('raises a danger alert when the RPC is not the expected chain', async () => {
    const a = await app({ chainId: 1 })
    const r = (await a.inject(`/api/security/alerts?address=${account.address}`)).json()
    expect(r.alerts[0].code).toBe('network-unverified')
  })

  it('states that $WIF is never required', async () => {
    const a = await app()
    expect((await a.inject('/api/token/wif/utility')).json().required).toBe(false)
  })

  it('has no subscription or payment endpoints', async () => {
    const a = await app()
    for (const u of ['/api/subscriptions', '/api/payments', '/api/premium', '/api/checkout', '/api/rewards']) expect((await a.inject(u)).statusCode).toBe(404)
  })

  it('rate limits', async () => {
    const a = await app({ rateLimitMax: 3 })
    const codes = []
    for (let i = 0; i < 4; i++) codes.push((await a.inject('/api/health')).statusCode)
    expect(codes).toEqual([200, 200, 200, 429])
  })

  it('schema has no columns for secrets', async () => {
    const cols = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'")
    const bad = cols.rows.filter((c) => /private|mnemonic|seed|phrase|password|vault|secret|pin$/i.test(c.column_name))
    expect(bad).toEqual([])
    const t = await pool.query("SELECT to_regclass('public.rewards') AS t")
    expect(t.rows[0].t).toBeNull() // rewards feature removed (migration 002)
  })
})
