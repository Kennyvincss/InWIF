/**
 * Read-only JSON-RPC relay for browsers whose RPC lacks CORS.
 * - Method allow-list (reads + eth_sendRawTransaction for already-signed txs).
 * - Never accepts or forwards anything secret-shaped; never signs.
 */
import { NextResponse } from 'next/server'
import { NETWORKS, containsSecret, type NetworkKey } from '@inwif/core'
import { logError, rateLimit } from '@/server/guard'

const ALLOWED = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getCode',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getBlockByNumber',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getLogs',
  'eth_simulateV1',
  'eth_sendRawTransaction',
  'net_version',
])

export async function POST(req: Request, ctx: { params: Promise<{ network: string }> }) {
  const limited = rateLimit(req, 600)
  if (limited) return limited
  const { network } = await ctx.params
  const cfg = NETWORKS[network as NetworkKey]
  if (!cfg || cfg.key === 'local') return NextResponse.json({ error: 'Unknown network' }, { status: 404 })
  const text = await req.text()
  if (text.length > 256_000) return NextResponse.json({ error: 'Request too large' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const calls = Array.isArray(body) ? body : [body]
  if (calls.length > 20) return NextResponse.json({ error: 'Batch too large' }, { status: 413 })
  for (const c of calls as { method?: string; params?: unknown }[]) {
    if (!c || typeof c.method !== 'string' || !ALLOWED.has(c.method)) return NextResponse.json({ error: `Method not allowed` }, { status: 403 })
    if (containsSecret(c.params)) return NextResponse.json({ error: 'Refusing to relay secret-shaped data' }, { status: 400 })
  }
  for (const url of cfg.rpcUrls) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: text, signal: AbortSignal.timeout(15_000) })
      if (!r.ok && r.status >= 500) continue
      return new NextResponse(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } })
    } catch (e) {
      logError('rpc', e)
    }
  }
  return NextResponse.json({ error: 'All upstream RPCs failed' }, { status: 502 })
}
