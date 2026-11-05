/**
 * Server-side RPC access (relays, backend). Never import this into browser code:
 * it reads API keys from server environment variables.
 *
 * Upstream order for a request:
 *   1. the network's managed RPC (e.g. Dwellir), when its key is configured and the
 *      method is not excluded for it (e.g. eth_getLogs);
 *   2. the public RPC endpoints, in order.
 */
import { createPublicClient, fallback, http, type PublicClient, type Transport } from 'viem'
import { toViemChain, type NetworkConfig } from './networks'

export interface Upstream {
  url: string
  headers: Record<string, string>
  managed: boolean
}

type Env = Record<string, string | undefined>

const processEnv = (): Env => (typeof process !== 'undefined' ? (process.env as Env) : {})

/** The managed-RPC key for this network, if configured (non-empty). */
export function managedRpcKey(network: NetworkConfig, env: Env = processEnv()): string | undefined {
  const m = network.managedRpc
  const v = m ? env[m.apiKeyEnv]?.trim() : undefined
  return v ? v : undefined
}

export function rpcUpstreams(network: NetworkConfig, methods: string[] = [], env: Env = processEnv()): Upstream[] {
  const out: Upstream[] = []
  const m = network.managedRpc
  const key = managedRpcKey(network, env)
  if (m && key && !methods.some((x) => m.excludedMethods.includes(x))) {
    out.push({ url: m.url, headers: { [m.apiKeyHeader]: key }, managed: true })
  }
  for (const url of network.rpcUrls) out.push({ url, headers: {}, managed: false })
  return out
}

/**
 * Should the relay move on to the next upstream after this managed-provider response?
 * True for HTTP errors, non-JSON bodies (e.g. plan-limit text) and JSON-RPC errors
 * that indicate quota, plan or method limits rather than a real execution result.
 */
export function shouldFailOver(status: number, bodyText: string): boolean {
  if (status === 429 || status >= 500 || status === 401 || status === 403) return true
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return true
  }
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return items.some((it) => {
    const e = (it as { error?: { code?: number; message?: string } })?.error
    if (!e) return false
    if (e.code === -32601 || e.code === -32005 || e.code === -32029) return true // method not found / limit exceeded / rate limited
    return /limit|quota|plan|upgrade|rate|exceed|not supported|unauthori[sz]ed|api key/i.test(e.message ?? '')
  })
}

const clients = new Map<string, PublicClient>()

/**
 * Read client for server code. Uses the managed RPC (with its key header) first when
 * configured, then the public RPCs. For eth_getLogs scans use `getPublicClient`, which
 * never touches the managed provider.
 */
export function getServerPublicClient(network: NetworkConfig, env: Env = processEnv()): PublicClient {
  const ups = rpcUpstreams(network, [], env)
  const cacheKey = `${network.key}:${ups.map((u) => `${u.url}|${u.managed}`).join(',')}`
  const hit = clients.get(cacheKey)
  if (hit) return hit
  const transports: Transport[] = ups.map((u) =>
    http(u.url, { timeout: 15_000, retryCount: 1, fetchOptions: Object.keys(u.headers).length ? { headers: u.headers } : undefined }),
  )
  const client = createPublicClient({
    chain: toViemChain(network),
    transport: transports.length > 1 ? fallback(transports) : transports[0]!,
  }) as PublicClient
  clients.set(cacheKey, client)
  return client
}
