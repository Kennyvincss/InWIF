/**
 * Token safety check: "is this token safe to buy?"
 *
 * Runs only reads and simulations against public chain data; nothing is signed or sent.
 * The checks are evidence, not a guarantee — a clean report does not prove a token is safe.
 */
import { erc20Abi, getAddress, parseAbi, parseAbiItem, toHex, type Address, type PublicClient } from 'viem'
import type { NetworkConfig } from './networks'
import { readTokenMetadata, type OnchainTokenMetadata, type TokenInfo } from './tokens'
import { NATIVE } from './swap'
import { getBestRouteQuote } from './swap-v4'

type Fetch = typeof fetch

export interface TokenHolder {
  address: Address
  isContract: boolean
  value: bigint
}

/** Top holders from the network's explorer (Blockscout v2). */
export async function fetchTokenHolders(network: NetworkConfig, token: Address, f: Fetch = fetch): Promise<TokenHolder[]> {
  if (!network.explorer.apiV2) throw new Error('No explorer API')
  const r = await f(`${network.explorer.apiV2}/tokens/${getAddress(token)}/holders`, { headers: { accept: 'application/json' } })
  if (r.headers.get('cf-mitigated') === 'challenge') throw new Error('Explorer bot protection blocked this request')
  if (!r.ok) throw new Error(`Explorer API ${r.status}`)
  const j = (await r.json()) as { items?: { address?: { hash?: string; is_contract?: boolean }; value?: string }[] }
  return parseTokenHolders(j)
}

export function parseTokenHolders(j: { items?: { address?: { hash?: string; is_contract?: boolean }; value?: string }[] }): TokenHolder[] {
  const out: TokenHolder[] = []
  for (const it of j.items ?? []) {
    const h = it.address?.hash
    if (!h || !/^0x[0-9a-fA-F]{40}$/.test(h) || !it.value || !/^\d+$/.test(it.value)) continue
    out.push({ address: getAddress(h), isContract: !!it.address?.is_contract, value: BigInt(it.value) })
  }
  return out.sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0))
}

export type CheckLevel = 'ok' | 'warn' | 'danger' | 'info'
export interface TokenCheckItem {
  id: string
  level: CheckLevel
  title: string
  detail: string
}

export interface TokenReport {
  token: Address
  meta?: OnchainTokenMetadata
  items: TokenCheckItem[]
  verdict: 'low' | 'medium' | 'high'
  transferTaxPct: number | null
  top1Pct: number | null
  top10Pct: number | null
}

const BURN = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead'])

/** A token that copies the name or symbol of a well-known token but is a different contract. */
export function detectCopycat(meta: { address: Address; name: string; symbol: string }, known: TokenInfo[]): TokenInfo | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const k of known) {
    if (getAddress(k.address) === getAddress(meta.address)) return null
    if (norm(k.symbol) === norm(meta.symbol) || norm(k.name) === norm(meta.name)) return k
  }
  return null
}

/** Share of supply held by the largest holder and the top ten (burn addresses excluded). */
export function concentration(holders: TokenHolder[], totalSupply: bigint) {
  const live = holders.filter((h) => !BURN.has(h.address.toLowerCase()))
  if (totalSupply <= 0n || live.length === 0) return { top1Pct: null, top10Pct: null, top1IsContract: null as boolean | null }
  const pct = (v: bigint) => Number((v * 1_000_000n) / totalSupply) / 10_000
  const top10 = live.slice(0, 10).reduce((s, h) => s + h.value, 0n)
  return { top1Pct: pct(live[0]!.value), top10Pct: pct(top10), top1IsContract: live[0]!.isContract }
}

export function verdictOf(items: TokenCheckItem[]): TokenReport['verdict'] {
  if (items.some((i) => i.level === 'danger')) return 'high'
  if (items.some((i) => i.level === 'warn')) return 'medium'
  return 'low'
}

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const OWNER_ABI = parseAbi(['function owner() view returns (address)', 'function getOwner() view returns (address)'])

/** The token's owner/admin if it exposes one. Owners are often exempt from restrictions, so they make poor test holders. */
async function readOwner(client: PublicClient, token: Address): Promise<string | null> {
  for (const fn of ['owner', 'getOwner'] as const) {
    try {
      const o = await client.readContract({ address: token, abi: OWNER_ABI, functionName: fn })
      if (o && !/^0x0{40}$/i.test(o)) return o.toLowerCase()
    } catch {
      /* not exposed */
    }
  }
  return null
}

/**
 * Fallback when the explorer's holder list is unavailable: ordinary wallets that recently
 * received the token and still hold some, from on-chain Transfer events (newest first).
 */
export async function findHoldersViaLogs(client: PublicClient, token: Address, max = 3, exclude: Set<string> = new Set()): Promise<TokenHolder[]> {
  const latest = await client.getBlockNumber({ cacheTime: 0 })
  const found: TokenHolder[] = []
  for (const span of [50_000n, 1_000_000n]) {
    let logs
    try {
      logs = await client.getLogs({ address: token, event: TRANSFER, fromBlock: latest > span ? latest - span : 0n, toBlock: 'latest' })
    } catch {
      continue
    }
    const seen = new Set<string>()
    for (const l of [...logs].reverse()) {
      const to = l.args.to?.toLowerCase()
      if (!to || seen.has(to) || BURN.has(to) || exclude.has(to)) continue
      seen.add(to)
      if (seen.size > 20 || found.length >= max) break
      const [code, bal] = await Promise.all([
        client.getCode({ address: getAddress(to) }).catch(() => undefined),
        client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(to)] }).catch(() => 0n),
      ])
      if ((!code || code === '0x') && bal > 0n) found.push({ address: getAddress(to), isContract: false, value: bal })
    }
    if (logs.length) break
  }
  return found
}

function randomAddress(): Address {
  const b = new Uint8Array(20)
  globalThis.crypto.getRandomValues(b)
  return getAddress(toHex(b))
}

/**
 * Simulate a real holder sending some of the token to a fresh address, then read what
 * arrived. Reverts mean transfers are blocked for ordinary holders (a classic "honeypot");
 * receiving less than was sent means the token takes a transfer tax.
 */
export async function simulateTransfer(
  client: PublicClient,
  token: Address,
  holder: Address,
  amount: bigint,
): Promise<{ ok: true; taxPct: number | null } | { ok: false; reason: string }> {
  const dst = randomAddress()
  try {
    const res = await client.simulateCalls({
      account: holder,
      calls: [
        { to: token, abi: erc20Abi, functionName: 'transfer', args: [dst, amount] },
        { to: token, abi: erc20Abi, functionName: 'balanceOf', args: [dst] },
      ],
    } as Parameters<PublicClient['simulateCalls']>[0])
    const [send, read] = res.results as { status: string; result?: unknown; error?: Error }[]
    if (send?.status !== 'success') return { ok: false, reason: send?.error?.message?.split('\n')[0] ?? 'transfer reverted' }
    const received = typeof read?.result === 'bigint' ? read.result : null
    if (received === null || amount === 0n) return { ok: true, taxPct: null }
    const tax = 1 - Number((received * 1_000_000n) / amount) / 1_000_000
    return { ok: true, taxPct: Math.max(0, Math.round(tax * 10_000) / 100) }
  } catch {
    // RPC without eth_simulateV1: fall back to a plain call (detects blocks, not taxes).
    try {
      await client.simulateContract({ account: holder, address: token, abi: erc20Abi, functionName: 'transfer', args: [dst, amount] })
      return { ok: true, taxPct: null }
    } catch (e) {
      return { ok: false, reason: ((e as { shortMessage?: string }).shortMessage ?? 'transfer reverted').split('\n')[0]! }
    }
  }
}

export async function analyzeToken(
  client: PublicClient,
  network: NetworkConfig,
  token: Address,
  opts: { known: TokenInfo[]; holders: TokenHolder[] | null },
): Promise<TokenReport> {
  const items: TokenCheckItem[] = []
  const report = (meta?: OnchainTokenMetadata, extra: Partial<TokenReport> = {}): TokenReport => ({
    token,
    meta,
    items,
    verdict: verdictOf(items),
    transferTaxPct: null,
    top1Pct: null,
    top10Pct: null,
    ...extra,
  })

  // 1. Is it a token at all?
  let meta: OnchainTokenMetadata
  try {
    meta = await readTokenMetadata(client, token)
  } catch (e) {
    const msg = (e as Error).message
    items.push({
      id: 'contract',
      level: 'danger',
      title: /No contract/.test(msg) ? 'Not a token contract' : 'Not a standard token',
      detail: /No contract/.test(msg) ? `Nothing is deployed at this address on ${network.name}.` : 'It does not answer the basic questions every token should (name, symbol, decimals, supply).',
    })
    return report()
  }
  items.push({ id: 'contract', level: 'ok', title: 'Standard token', detail: `${meta.name} (${meta.symbol}), ${meta.decimals} decimals.` })

  // 2. Copycat of a well-known token?
  const twin = detectCopycat(meta, opts.known)
  items.push(
    twin
      ? { id: 'copycat', level: 'danger', title: `Copycat of ${twin.symbol}`, detail: `It uses the name or symbol of ${twin.name}, but it is a different contract. The real ${twin.symbol} is ${twin.address}.` }
      : { id: 'copycat', level: 'ok', title: 'Not impersonating a known token', detail: 'Its name and symbol do not copy a token InWIF knows.' },
  )

  // 3. Holders and concentration.
  const holders = opts.holders
  let top1Pct: number | null = null
  let top10Pct: number | null = null
  if (!holders) {
    items.push({ id: 'holders', level: 'info', title: 'Holder data unavailable', detail: 'The holder list could not be loaded right now, so ownership could not be checked.' })
  } else {
    const c = concentration(holders, meta.totalSupply)
    top1Pct = c.top1Pct
    top10Pct = c.top10Pct
    if (c.top1Pct === null) items.push({ id: 'holders', level: 'warn', title: 'No holders found', detail: 'Nobody seems to hold this token yet.' })
    else if (c.top1Pct >= 20 && !c.top1IsContract)
      items.push({ id: 'holders', level: 'warn', title: `One wallet holds ${c.top1Pct.toFixed(1)}%`, detail: 'A single wallet controls a large share of the supply and could crash the price by selling.' })
    else if ((c.top10Pct ?? 0) >= 80)
      items.push({ id: 'holders', level: 'warn', title: `Top 10 hold ${c.top10Pct!.toFixed(1)}%`, detail: 'Ownership is concentrated in a few wallets (this can include trading pools).' })
    else items.push({ id: 'holders', level: 'ok', title: 'Ownership is spread out', detail: `Largest holder ${c.top1Pct.toFixed(1)}%${c.top1IsContract ? ' (a contract, often a trading pool)' : ''}; top 10 hold ${c.top10Pct!.toFixed(1)}%.` })
  }

  // 4. Can ordinary holders move it, and is there a transfer tax? Test from up to three
  // real holders, never the owner (owners are often exempt from a honeypot's restrictions).
  let transferTaxPct: number | null = null
  const tokenAddr = getAddress(meta.address)
  const owner = await readOwner(client, tokenAddr)
  const skip = new Set<string>([...BURN, ...(owner ? [owner] : [])])
  let testers = (holders ?? []).filter((h) => !h.isContract && h.value > 0n && !skip.has(h.address.toLowerCase())).slice(0, 3)
  if (testers.length === 0) testers = await findHoldersViaLogs(client, tokenAddr, 3, skip).catch(() => [])
  if (testers.length === 0) {
    items.push({ id: 'transfer', level: 'info', title: 'Transfer test skipped', detail: 'No ordinary wallet holding this token was found to test with.' })
  } else {
    const results = await Promise.all(testers.map((h) => simulateTransfer(client, tokenAddr, h.address, h.value / 100n || 1n)))
    const failed = results.find((r): r is { ok: false; reason: string } => !r.ok)
    const taxes = results.flatMap((r) => (r.ok && r.taxPct !== null ? [r.taxPct] : []))
    transferTaxPct = taxes.length ? Math.max(...taxes) : null
    const n = testers.length === 1 ? 'a real holder' : `${testers.length} real holders`
    if (failed) items.push({ id: 'transfer', level: 'danger', title: 'Holders cannot transfer it', detail: `A test transfer from ${n} failed (${failed.reason}). Tokens like this can often be bought but not sold.` })
    else if (transferTaxPct === null) items.push({ id: 'transfer', level: 'ok', title: 'Transfers work', detail: `Test transfers from ${n} succeeded. Transfer tax could not be measured on this network.` })
    else if (transferTaxPct >= 10) items.push({ id: 'transfer', level: 'danger', title: `${transferTaxPct}% transfer tax`, detail: 'Every transfer loses a large share to a fee built into the token.' })
    else if (transferTaxPct > 0) items.push({ id: 'transfer', level: 'warn', title: `${transferTaxPct}% transfer tax`, detail: 'Each transfer loses a small share to a fee built into the token.' })
    else items.push({ id: 'transfer', level: 'ok', title: 'Transfers work, no tax', detail: `Test transfers from ${n} arrived in full.` })
  }

  // 5. Can you sell it back to ETH?
  const probe = meta.totalSupply / 1_000_000n || 1n
  try {
    const q = await getBestRouteQuote(client, { v3: network.uniswapV3, v4: network.uniswapV4 }, getAddress(meta.address), NATIVE, probe)
    items.push({ id: 'liquidity', level: 'ok', title: 'You can sell it for ETH', detail: q.amountOut > 0n ? 'There is a market where it can be swapped back to ETH.' : 'A market exists but returned no ETH for a small sale.' })
  } catch {
    items.push({ id: 'liquidity', level: 'warn', title: 'No market to sell into', detail: 'InWIF found no pool where this token can be swapped back to ETH. You may not be able to sell it.' })
  }

  return report(meta, { transferTaxPct, top1Pct, top10Pct })
}
