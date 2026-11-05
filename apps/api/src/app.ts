/**
 * InWIF public-data API.
 *
 * Hard rules enforced here:
 *  - No endpoint accepts private keys, recovery phrases or vaults; any request
 *    carrying secret-shaped data is rejected before reaching a handler.
 *  - The backend never signs transactions.
 *  - No subscription, payment or feature-gating endpoints exist.
 *  - Logs never include request bodies; error messages are redacted.
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getAddress, isAddress, verifyMessage, type Address, type PublicClient } from 'viem'
import {
  DEFAULT_TOKENS,
  NETWORKS,
  WIF_ADDRESS,
  compareMetadata,
  containsSecret,
  fetchTokenMarket,
  fetchTokenTransfers,
  fetchTransactions,
  findApprovals,
  getPublicClient,
  getServerPublicClient,
  mergeActivity,
  readBalances,
  readTokenMetadata,
  redact,
  verifyNetwork,
  INWIF_POLICY,
  type NetworkConfig,
  type NetworkKey,
} from '@inwif/core'
import type { Db } from './db/pool'

export interface AppDeps {
  db: Db
  /** Read client (managed RPC first when its key is configured). */
  clientFor?: (n: NetworkConfig) => PublicClient
  /** Client for eth_getLogs scans — public RPCs only (managed providers cap log ranges). */
  logsClientFor?: (n: NetworkConfig) => PublicClient
  fetchImpl?: typeof fetch
  corsOrigins?: string[]
  redisUrl?: string
  rateLimitMax?: number
  logger?: boolean
}

const addr = z.string().refine((v) => isAddress(v, { strict: false }), 'Invalid address').transform((v) => getAddress(v))
const network = z.enum(['robinhood', 'robinhoodTestnet']).default('robinhood')
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger
      ? { redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body'], censor: '[REDACTED]' } }
      : false,
    bodyLimit: 32 * 1024,
    trustProxy: true,
  })
  const db = deps.db
  const clientFor = deps.clientFor ?? ((n: NetworkConfig) => getServerPublicClient(n))
  const logsClientFor = deps.logsClientFor ?? deps.clientFor ?? getPublicClient
  const f = deps.fetchImpl ?? fetch

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, { origin: deps.corsOrigins ?? ['http://localhost:3000'], methods: ['GET', 'POST'] })
  let redis: unknown
  if (deps.redisUrl) {
    const { Redis } = await import('ioredis')
    redis = new Redis(deps.redisUrl, { maxRetriesPerRequest: 1 })
  }
  await app.register(rateLimit, { max: deps.rateLimitMax ?? 120, timeWindow: '1 minute', ...(redis ? { redis: redis as never } : {}) })

  // Reject anything that looks like a private key or recovery phrase, anywhere in the request.
  app.addHook('preValidation', async (req) => {
    if (containsSecret(req.body) || containsSecret(req.query) || containsSecret(req.params)) {
      throw new HttpError(400, 'InWIF never accepts private keys or recovery phrases. Keep them on your device.')
    }
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'Invalid request', issues: err.issues.map((i) => i.message) })
    const e = err as { statusCode?: number; message?: string }
    const status = e.statusCode ?? 500
    if (status >= 500) req.log.error({ err: redact(String(e.message)) }, 'request failed')
    return reply.status(status).send({ error: status >= 500 ? 'Internal error' : e.message })
  })

  async function auth(req: FastifyRequest): Promise<{ userId: string }> {
    const h = req.headers.authorization
    if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required')
    const r = await db.query<{ user_id: string }>('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [sha256(h.slice(7))])
    if (!r.rows[0]) throw new HttpError(401, 'Session expired')
    return { userId: r.rows[0].user_id }
  }

  const net = (k: NetworkKey) => NETWORKS[k]

  // ---------------------------------------------------------------- health
  app.get('/api/health', async () => ({ ok: true, policy: INWIF_POLICY }))

  // ---------------------------------------------------------------- auth (sign-in with wallet signature)
  app.post('/api/auth/challenge', async (req) => {
    const { address } = z.object({ address: addr }).parse(req.body)
    const nonce = randomBytes(16).toString('hex')
    const issued = new Date()
    const expires = new Date(issued.getTime() + 5 * 60_000)
    const message = [
      'InWIF wants you to sign in with your address:',
      address,
      '',
      'Signing proves you control this address. It does not send a transaction and costs nothing.',
      '',
      `Nonce: ${nonce}`,
      `Issued At: ${issued.toISOString()}`,
      `Expires At: ${expires.toISOString()}`,
    ].join('\n')
    await db.query('INSERT INTO auth_nonces (nonce, address, message, expires_at) VALUES ($1, $2, $3, $4)', [nonce, address.toLowerCase(), message, expires])
    return { nonce, message, expiresAt: expires.toISOString() }
  })

  app.post('/api/auth/verify', async (req) => {
    const body = z
      .object({ address: addr, nonce: z.string().regex(/^[0-9a-f]{32}$/), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) })
      .parse(req.body)
    const r = await db.query<{ message: string }>(
      'UPDATE auth_nonces SET used = true WHERE nonce = $1 AND address = $2 AND used = false AND expires_at > now() RETURNING message',
      [body.nonce, body.address.toLowerCase()],
    )
    const row = r.rows[0]
    if (!row) throw new HttpError(401, 'Challenge expired or already used')
    const ok = await verifyMessage({ address: body.address, message: row.message, signature: body.signature as `0x${string}` })
    if (!ok) throw new HttpError(401, 'Signature does not match address')

    const lower = body.address.toLowerCase()
    let userId = (await db.query<{ user_id: string }>('SELECT user_id FROM wallet_profiles WHERE address = $1 LIMIT 1', [lower])).rows[0]?.user_id
    if (!userId) {
      userId = (await db.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0]!.id
      await db.query('INSERT INTO wallet_profiles (user_id, address, network) VALUES ($1, $2, $3)', [userId, lower, 'robinhood'])
    }
    const token = randomBytes(32).toString('hex')
    await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')", [sha256(token), userId])
    return { token, userId }
  })

  app.get('/api/me', async (req) => {
    const { userId } = await auth(req)
    const wallets = await db.query('SELECT address, name, network, created_at FROM wallet_profiles WHERE user_id = $1 ORDER BY created_at', [userId])
    return { userId, wallets: wallets.rows }
  })

  // ---------------------------------------------------------------- wallet (public chain data)
  app.get('/api/wallet/balances', async (req) => {
    const q = z.object({ address: addr, network }).parse(req.query)
    const n = net(q.network)
    const { balances, errors } = await readBalances(clientFor(n), q.address, DEFAULT_TOKENS[q.network], n.nativeCurrency)
    return {
      network: n.key,
      chainId: n.chainId,
      address: q.address,
      balances: balances.map((b) => ({
        token: b.token === 'native' ? 'native' : b.token.address,
        symbol: b.symbol,
        decimals: b.decimals,
        raw: b.raw.toString(),
      })),
      errors: errors.map((e) => e.token.symbol),
      source: 'rpc',
    }
  })

  app.get('/api/wallet/transactions', async (req) => {
    const q = z.object({ address: addr, network }).parse(req.query)
    const n = net(q.network)
    try {
      const [t, tt] = await Promise.all([fetchTransactions(n, q.address, undefined, f), fetchTokenTransfers(n, q.address, {}, f)])
      return { network: n.key, items: mergeActivity(t.items, tt.items), source: 'blockscout' }
    } catch {
      throw new HttpError(502, 'Explorer unavailable')
    }
  })

  // ---------------------------------------------------------------- $WIF
  app.get('/api/token/wif', async () => {
    const n = net('robinhood')
    const client = clientFor(n)
    const listing = DEFAULT_TOKENS.robinhood.find((t) => t.isWif)!
    const [meta, market] = await Promise.all([
      readTokenMetadata(client, WIF_ADDRESS),
      fetchTokenMarket('robinhood', WIF_ADDRESS, f).catch(() => null),
    ])
    const check = compareMetadata(listing, meta)
    return {
      address: WIF_ADDRESS,
      chainId: n.chainId,
      onchain: { name: meta.name, symbol: meta.symbol, decimals: meta.decimals, totalSupply: meta.totalSupply.toString() },
      verified: check.matches,
      issues: check.issues,
      market: market ? { ...market, source: 'geckoterminal' } : null,
    }
  })

  app.get('/api/token/wif/utility', async () => ({
    token: WIF_ADDRESS,
    required: false,
    statement: 'Every InWIF feature is free and identical for every user. $WIF is never required, never charged and never burned by InWIF.',
    utilities: [
      { id: 'dashboard', title: '$WIF dashboard', description: 'Verified contract data, balance, market data and transfer history.' },
      { id: 'swap', title: 'Zero-fee swaps', description: 'Swap via Uniswap V3 with no InWIF fee.' },
      { id: 'profile', title: 'Ecosystem profile', description: 'Public on-chain participation summary.' },
      { id: 'approvals', title: 'Approval protection', description: 'Find and revoke $WIF allowances.' },
    ],
  }))

  // ---------------------------------------------------------------- devices (public device metadata only)
  app.get('/api/devices', async (req) => {
    const { userId } = await auth(req)
    const r = await db.query(
      `SELECT d.id, d.device_identifier, d.name, d.model, d.firmware_version, d.simulated, d.created_at,
              (SELECT max(connected_at) FROM device_connections c WHERE c.device_id = d.id) AS last_connected,
              (SELECT count(*)::int FROM device_connections c WHERE c.device_id = d.id) AS connections
         FROM hardware_devices d WHERE d.user_id = $1 ORDER BY d.created_at`,
      [userId],
    )
    return { devices: r.rows }
  })

  app.post('/api/devices/connect', async (req) => {
    const { userId } = await auth(req)
    const b = z
      .object({
        deviceIdentifier: z.string().regex(/^[A-Za-z0-9-]{4,64}$/),
        model: z.string().min(1).max(64),
        firmwareVersion: z.string().min(1).max(32),
        transport: z.enum(['simulator', 'webserial', 'webhid', 'ble', 'usb']),
        simulated: z.boolean().default(false),
        name: z.string().max(32).optional(),
      })
      .strict()
      .parse(req.body)
    const d = await db.query<{ id: string }>(
      `INSERT INTO hardware_devices (user_id, device_identifier, name, model, firmware_version, simulated)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, device_identifier) DO UPDATE SET firmware_version = EXCLUDED.firmware_version, name = COALESCE(EXCLUDED.name, hardware_devices.name)
       RETURNING id`,
      [userId, b.deviceIdentifier, b.name ?? null, b.model, b.firmwareVersion, b.simulated],
    )
    await db.query('INSERT INTO device_connections (device_id, firmware_version, transport) VALUES ($1, $2, $3)', [d.rows[0]!.id, b.firmwareVersion, b.transport])
    return { deviceId: d.rows[0]!.id }
  })

  // ---------------------------------------------------------------- security
  app.get('/api/security/alerts', async (req) => {
    const q = z.object({ address: addr, network }).parse(req.query)
    const n = net(q.network)
    const client = clientFor(n)
    const verification = await verifyNetwork(n, client)
    const alerts: { severity: 'info' | 'warning' | 'danger'; code: string; message: string }[] = []
    if (!verification.ok) alerts.push({ severity: 'danger', code: 'network-unverified', message: verification.reason })
    const tokens = DEFAULT_TOKENS[q.network].map((t) => t.address as Address)
    if (verification.ok && tokens.length) {
      const { approvals } = await findApprovals(logsClientFor(n), q.address, tokens)
      for (const a of approvals)
        alerts.push({
          severity: a.unlimited ? 'danger' : 'warning',
          code: a.unlimited ? 'unlimited-approval' : 'approval',
          message: `${a.unlimited ? 'Unlimited' : 'Active'} approval of ${a.token} to ${a.spender}`,
        })
    }
    alerts.push({ severity: 'info', code: 'not-a-guarantee', message: 'No alert does not mean an address or contract is safe.' })
    return { address: q.address, network: n.key, alerts }
  })

  return app
}
