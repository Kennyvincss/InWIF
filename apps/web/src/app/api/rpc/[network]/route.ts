/**
 * Read-only JSON-RPC relay.
 * - Method allow-list (reads + eth_sendRawTransaction for already-signed txs).
 * - Never accepts or forwards anything secret-shaped; never signs.
 * - Upstreams: the managed RPC (Dwellir) first when DWELLIR_API_KEY is set — the key
 *   stays on the server and is sent as a header — then the public RPCs. eth_getLogs
 *   always goes to the public RPCs (Dwellir plan / block-range limits), and limit or
 *   plan errors from the managed provider fail over to the public RPCs.
 */
import { NextResponse } from 'next/server'
import { NETWORKS, containsSecret, rpcUpstreams, shouldFailOver, type NetworkKey } from '@inwif/core'
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
  const limited = await rateLimit(req, 600)
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
  // Each call in a batch counts against the limit (the first was charged above).
  if (calls.length > 1) {
    const over = await rateLimit(req, 600, calls.length - 1)
    if (over) return over
  }
  for (const c of calls as { method?: string; params?: unknown }[]) {
    if (!c || typeof c.method !== 'string' || !ALLOWED.has(c.method)) return NextResponse.json({ error: `Method not allowed` }, { status: 403 })
    if (containsSecret(c.params, { allowHex32: true })) return NextResponse.json({ error: 'Refusing to relay secret-shaped data' }, { status: 400 })
  }
  const methods = (calls as { method: string }[]).map((c) => c.method)
  for (const up of rpcUpstreams(cfg, methods)) {
    try {
      const r = await fetch(up.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...up.headers },
        body: text,
        signal: AbortSignal.timeout(15_000),
      })
      const out = await r.text()
      if (up.managed ? shouldFailOver(r.status, out) : !r.ok && r.status >= 500) continue
      return new NextResponse(out, { status: r.status, headers: { 'content-type': 'application/json', 'x-inwif-upstream': up.managed ? 'managed' : 'public' } })
    } catch (e) {
      logError('rpc', e)
    }
  }
  return NextResponse.json({ error: 'All upstream RPCs failed' }, { status: 502 })
}
