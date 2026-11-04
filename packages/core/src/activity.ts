/**
 * Transaction history from the network's Blockscout explorer (REST API v2).
 * Handles both older (`tx_hash`, `block`) and newer (`transaction_hash`,
 * `block_number`) Blockscout field names.
 */
import { getAddress, parseAbiItem, type Address, type PublicClient } from 'viem'
import type { NetworkConfig } from './networks'

type Fetch = typeof fetch

export type ActivityDirection = 'in' | 'out' | 'self'
export type ActivityStatus = 'success' | 'failed' | 'pending'

export interface ActivityItem {
  hash: string
  timestamp?: string
  blockNumber?: number
  kind: 'native' | 'token' | 'contract'
  direction: ActivityDirection
  from: Address
  to?: Address
  value: string
  decimals: number
  symbol: string
  tokenAddress?: Address
  method?: string
  status: ActivityStatus
  feeWei?: string
  /** Set when the item was read directly from RPC logs because the explorer was unavailable. */
  via?: 'rpc'
}

interface BsAddr {
  hash: string
}
interface BsTx {
  hash: string
  from: BsAddr
  to: BsAddr | null
  value: string
  status?: string | null
  result?: string
  timestamp?: string
  method?: string | null
  fee?: { value: string } | null
  block?: number
  block_number?: number
  created_contract?: BsAddr | null
}
interface BsTransfer {
  tx_hash?: string
  transaction_hash?: string
  from: BsAddr
  to: BsAddr
  token: { address?: string; address_hash?: string; symbol?: string | null; decimals?: string | null }
  total: { value?: string; decimals?: string | null }
  timestamp?: string
  method?: string | null
  block_number?: number
}

export interface Page<T> {
  items: T[]
  next?: Record<string, string | number>
}

function direction(self: string, from: string, to?: string | null): ActivityDirection {
  const s = self.toLowerCase()
  if (from.toLowerCase() === s && to?.toLowerCase() === s) return 'self'
  return from.toLowerCase() === s ? 'out' : 'in'
}

function qs(params?: Record<string, string | number>): string {
  if (!params) return ''
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) u.set(k, String(v))
  return `?${u.toString()}`
}

async function getJson<T>(f: Fetch, url: string): Promise<T> {
  const r = await f(url, { headers: { accept: 'application/json' } })
  if (r.headers.get('cf-mitigated') === 'challenge') throw new Error('Explorer bot protection (Cloudflare) blocked this request')
  if (!r.ok) throw new Error(`Explorer API ${r.status} for ${new URL(url).pathname}`)
  return (await r.json()) as T
}

export async function fetchTransactions(
  network: NetworkConfig,
  address: Address,
  next?: Record<string, string | number>,
  f: Fetch = fetch,
): Promise<Page<ActivityItem>> {
  if (!network.explorer.apiV2) throw new Error(`${network.name} has no explorer API configured.`)
  const data = await getJson<{ items: BsTx[]; next_page_params?: Record<string, string | number> | null }>(
    f,
    `${network.explorer.apiV2}/addresses/${address}/transactions${qs(next)}`,
  )
  return {
    items: data.items.map((t) => ({
      hash: t.hash,
      timestamp: t.timestamp,
      blockNumber: t.block_number ?? t.block,
      kind: t.method && t.method !== 'transfer' ? 'contract' : 'native',
      direction: direction(address, t.from.hash, t.to?.hash),
      from: getAddress(t.from.hash),
      to: t.to ? getAddress(t.to.hash) : t.created_contract ? getAddress(t.created_contract.hash) : undefined,
      value: t.value ?? '0',
      decimals: network.nativeCurrency.decimals,
      symbol: network.nativeCurrency.symbol,
      method: t.method ?? undefined,
      status: t.status === 'error' ? 'failed' : t.status === 'ok' ? 'success' : 'pending',
      feeWei: t.fee?.value,
    })),
    next: data.next_page_params ?? undefined,
  }
}

export async function fetchTokenTransfers(
  network: NetworkConfig,
  address: Address,
  opts: { token?: Address; next?: Record<string, string | number> } = {},
  f: Fetch = fetch,
): Promise<Page<ActivityItem>> {
  if (!network.explorer.apiV2) throw new Error(`${network.name} has no explorer API configured.`)
  const params: Record<string, string | number> = { type: 'ERC-20', ...(opts.next ?? {}) }
  if (opts.token) params.token = opts.token
  const data = await getJson<{ items: BsTransfer[]; next_page_params?: Record<string, string | number> | null }>(
    f,
    `${network.explorer.apiV2}/addresses/${address}/token-transfers${qs(params)}`,
  )
  return {
    items: data.items.map((t) => {
      const tokenAddr = t.token.address_hash ?? t.token.address
      return {
        hash: (t.transaction_hash ?? t.tx_hash)!,
        timestamp: t.timestamp,
        blockNumber: t.block_number,
        kind: 'token' as const,
        direction: direction(address, t.from.hash, t.to.hash),
        from: getAddress(t.from.hash),
        to: getAddress(t.to.hash),
        value: t.total.value ?? '0',
        decimals: Number(t.total.decimals ?? t.token.decimals ?? 18),
        symbol: t.token.symbol ?? '?',
        tokenAddress: tokenAddr ? getAddress(tokenAddr) : undefined,
        method: t.method ?? undefined,
        status: 'success' as const,
      }
    }),
    next: data.next_page_params ?? undefined,
  }
}

export interface ExplorerTokenInfo {
  name?: string
  symbol?: string
  decimals?: string
  totalSupply?: string
  holders?: string
  iconUrl?: string
  exchangeRate?: string
}

export async function fetchExplorerToken(network: NetworkConfig, token: Address, f: Fetch = fetch): Promise<ExplorerTokenInfo> {
  if (!network.explorer.apiV2) throw new Error('No explorer API')
  const t = await getJson<Record<string, string | null | undefined>>(f, `${network.explorer.apiV2}/tokens/${token}`)
  return {
    name: t.name ?? undefined,
    symbol: t.symbol ?? undefined,
    decimals: t.decimals ?? undefined,
    totalSupply: t.total_supply ?? undefined,
    holders: (t.holders_count ?? t.holders) ?? undefined,
    iconUrl: t.icon_url ?? undefined,
    exchangeRate: t.exchange_rate ?? undefined,
  }
}

/** Merge native + token activity, newest first, de-duplicating identical rows. */
export function mergeActivity(...lists: ActivityItem[][]): ActivityItem[] {
  const seen = new Set<string>()
  const all = lists.flat().filter((i) => {
    const k = `${i.hash}:${i.kind}:${i.tokenAddress ?? ''}:${i.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return all.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
}

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

/**
 * Fallback when the explorer is unreachable: recent ERC-20 transfers of the
 * given tokens, read straight from chain logs. Covers `maxBlocks` back from the
 * head in RPC-sized chunks. Native ETH transfers are not visible this way.
 */
export async function fetchTokenTransfersViaRpc(
  client: PublicClient,
  owner: Address,
  tokens: { address: Address; symbol: string; decimals: number }[],
  opts: { maxBlocks?: bigint; chunk?: bigint; limit?: number } = {},
): Promise<ActivityItem[]> {
  const chunk = opts.chunk ?? 10_000_000n
  const latest = await client.getBlockNumber()
  const floor = latest > (opts.maxBlocks ?? 30_000_000n) ? latest - (opts.maxBlocks ?? 30_000_000n) : 0n
  const items: ActivityItem[] = []
  const byToken = new Map(tokens.map((t) => [t.address.toLowerCase(), t]))
  for (let to = latest; to > floor; to -= chunk) {
    const from = to - chunk + 1n > floor ? to - chunk + 1n : floor
    const queries = tokens.flatMap((t) => [
      client.getLogs({ address: t.address, event: transferEvent, args: { from: owner }, fromBlock: from, toBlock: to }),
      client.getLogs({ address: t.address, event: transferEvent, args: { to: owner }, fromBlock: from, toBlock: to }),
    ])
    for (const logs of await Promise.all(queries)) {
      for (const l of logs) {
        const t = byToken.get(l.address.toLowerCase())!
        items.push({
          hash: l.transactionHash!,
          blockNumber: Number(l.blockNumber),
          kind: 'token',
          direction: direction(owner, l.args.from!, l.args.to!),
          from: getAddress(l.args.from!),
          to: getAddress(l.args.to!),
          value: l.args.value!.toString(),
          decimals: t.decimals,
          symbol: t.symbol,
          tokenAddress: getAddress(l.address),
          status: 'success',
          via: 'rpc',
        })
      }
    }
    if (items.length >= (opts.limit ?? 25)) break
  }
  items.sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0))
  const top = items.slice(0, opts.limit ?? 25)
  // Real timestamps from block headers (one call per distinct block).
  const blocks = [...new Set(top.map((i) => i.blockNumber!))]
  const stamps = new Map(
    await Promise.all(blocks.map(async (b) => [b, new Date(Number((await client.getBlock({ blockNumber: BigInt(b) })).timestamp) * 1000).toISOString()] as const)),
  )
  return top.map((i) => ({ ...i, timestamp: stamps.get(i.blockNumber!) }))
}
