'use client'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits, maxUint256, type Address } from 'viem'
import { ArrowDownUp, ShieldCheck } from 'lucide-react'
import {
  NATIVE,
  approveCalldata,
  buildSwapTx,
  getBestQuote,
  minimumReceived,
  parseAmount,
  readAllowance,
  verifyUniswapDeployment,
  type SwapQuote,
  type SwapToken,
} from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useNetwork, usePortfolio, useTokens } from '@/lib/hooks'
import { fmtToken, fmtUsd } from '@/lib/format'
import { TxFlow, type TxRequest } from '@/components/TxFlow'
import { Badge, ErrorBox, Notice, PageHeader, Row, Spinner, cx } from '@/components/ui'

const SLIPPAGES = [10, 50, 100, 300]

export default function SwapPage() {
  const { activeAccount, state, update } = useWallet()
  const { network, client } = useNetwork()
  const tokens = useTokens()
  const { rows } = usePortfolio(activeAccount?.address)
  const cfg = network.uniswapV3
  const options = useMemo(
    () => [{ key: NATIVE as SwapToken, symbol: 'ETH', decimals: 18 }, ...tokens.map((t) => ({ key: t.address as SwapToken, symbol: t.symbol, decimals: t.decimals }))],
    [tokens],
  )
  const [fromKey, setFrom] = useState<SwapToken>(NATIVE)
  const [toKey, setTo] = useState<SwapToken>(tokens.find((t) => t.isWif)?.address ?? NATIVE)
  const [amount, setAmount] = useState('')
  const [debounced, setDebounced] = useState('')
  const [unlimited, setUnlimited] = useState(false)
  const [req, setReq] = useState<TxRequest | null>(null)
  const slippageBps = state.settings.slippageBps

  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 400)
    return () => clearTimeout(t)
  }, [amount])

  const from = options.find((o) => o.key === fromKey)!
  const to = options.find((o) => o.key === toKey)!
  const bal = rows.find((r) => r.key === (fromKey === NATIVE ? 'native' : fromKey))
  const parsed = debounced ? parseAmount(debounced, from.decimals, bal?.raw) : null

  const deployment = useQuery({
    queryKey: ['uni-deploy', network.key],
    enabled: !!cfg,
    queryFn: () => verifyUniswapDeployment(client, cfg!),
    staleTime: 3_600_000,
  })

  const quote = useQuery({
    queryKey: ['quote', network.key, fromKey, toKey, parsed?.raw?.toString()],
    enabled: !!cfg && deployment.data?.ok === true && !!parsed?.raw && fromKey !== toKey,
    queryFn: () => getBestQuote(client, cfg!, fromKey, toKey, parsed!.raw!),
    refetchInterval: 20_000,
    retry: false,
  })

  const allowance = useQuery({
    queryKey: ['allowance', network.key, fromKey, activeAccount?.address],
    enabled: !!cfg && fromKey !== NATIVE && !!activeAccount,
    queryFn: () => readAllowance(client, fromKey as Address, activeAccount!.address, cfg!.swapRouter02),
  })

  const q: SwapQuote | undefined = quote.data
  const needsApproval = fromKey !== NATIVE && q && (allowance.data ?? 0n) < q.amountIn
  const impactPct = q?.priceImpact !== null && q?.priceImpact !== undefined ? q.priceImpact * 100 : null
  const toPrice = rows.find((r) => r.key === (toKey === NATIVE ? 'native' : toKey))?.priceUsd ?? null

  if (!cfg)
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Swap" />
        <Notice>Swaps are not available on {network.name}: no verified DEX deployment is configured for this network.</Notice>
      </div>
    )

  function approve() {
    if (!q) return
    setReq({
      to: fromKey as Address,
      data: approveCalldata(cfg!.swapRouter02, unlimited ? maxUint256 : q.amountIn),
      summary: `Approve ${from.symbol} for Uniswap`,
      kind: 'approve',
    })
  }

  function swap() {
    if (!q || !activeAccount) return
    const tx = buildSwapTx(cfg!, q, activeAccount.address, slippageBps, 20 * 60)
    setReq({ to: tx.to, data: tx.data, value: tx.value, summary: `Swap ${amount} ${from.symbol} → ${to.symbol}`, kind: 'swap' })
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Swap" subtitle="Routed through Uniswap V3 on Robinhood Chain. InWIF adds no fee." />
      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {deployment.isLoading && <Badge>Verifying Uniswap contracts…</Badge>}
          {deployment.data?.ok && (
            <Badge tone="ok">
              <ShieldCheck className="h-3 w-3" /> Uniswap V3 contracts verified on-chain
            </Badge>
          )}
          {deployment.data && !deployment.data.ok && <Badge tone="bad">Uniswap contracts not found — swaps disabled</Badge>}
        </div>

        <div className="rounded-2xl bg-ink-900 p-4">
          <div className="flex items-center justify-between text-xs text-mute">
            <span>You pay</span>
            <span>
              Balance {bal ? fmtToken(bal.raw, bal.decimals) : '—'}{' '}
              {bal && fromKey !== NATIVE && (
                <button className="ml-1 text-lime" onClick={() => setAmount(formatUnits(bal.raw, bal.decimals))}>
                  Max
                </button>
              )}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input border-0 bg-transparent px-0 text-2xl focus:ring-0" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount to swap" />
            <select className="input w-32" value={fromKey} onChange={(e) => setFrom(e.target.value as SwapToken)} aria-label="From token">
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.symbol}
                </option>
              ))}
            </select>
          </div>
          {parsed && !parsed.ok && <p className="text-xs text-bad">{parsed.error}</p>}
        </div>

        <div className="-my-2 flex justify-center">
          <button
            className="rounded-xl border border-white/10 bg-ink-800 p-2 hover:border-lime/40"
            aria-label="Switch tokens"
            onClick={() => {
              setFrom(toKey)
              setTo(fromKey)
            }}
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-ink-900 p-4">
          <div className="text-xs text-mute">You receive (estimated)</div>
          <div className="mt-2 flex gap-2">
            <div className="flex-1 text-2xl">{quote.isFetching && !q ? <Spinner /> : q ? fmtToken(q.amountOut, to.decimals) : '0.0'}</div>
            <select className="input w-32" value={toKey} onChange={(e) => setTo(e.target.value as SwapToken)} aria-label="To token">
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.symbol}
                </option>
              ))}
            </select>
          </div>
          {q && toPrice !== null && <p className="text-xs text-mute">≈ {fmtUsd(Number(formatUnits(q.amountOut, to.decimals)) * toPrice)}</p>}
        </div>

        {quote.isError && <ErrorBox>{(quote.error as Error).message}</ErrorBox>}

        <div>
          <p className="label">Slippage tolerance</p>
          <div className="flex gap-2">
            {SLIPPAGES.map((s) => (
              <button
                key={s}
                className={cx('chip', slippageBps === s && 'border-lime/40 text-lime')}
                onClick={() => update((st) => ({ ...st, settings: { ...st.settings, slippageBps: s } }))}
              >
                {s / 100}%
              </button>
            ))}
          </div>
          {slippageBps >= 300 && <p className="mt-1 text-xs text-warn">High slippage increases the risk of an unfavourable trade (front-running).</p>}
        </div>

        {q && (
          <div className="rounded-xl border border-white/[0.06] px-4 py-1">
            <Row label="Rate">
              1 {from.symbol} ≈ {(Number(formatUnits(q.amountOut, to.decimals)) / Number(formatUnits(q.amountIn, from.decimals))).toPrecision(6)} {to.symbol}
            </Row>
            <Row label="Price impact">
              <span className={cx(impactPct !== null && impactPct > 5 && 'font-semibold text-bad', impactPct !== null && impactPct > 1 && impactPct <= 5 && 'text-warn')}>
                {impactPct !== null ? `${impactPct.toFixed(2)}% (estimated)` : 'unknown'}
              </span>
            </Row>
            <Row label="Minimum received">
              {fmtToken(minimumReceived(q.amountOut, slippageBps), to.decimals)} {to.symbol}
            </Row>
            <Row label="Route">{q.route}</Row>
            <Row label="Uniswap pool fee (to liquidity providers)">{(q.fee / 10_000).toFixed(2)}%</Row>
            <Row label="InWIF fee">0 — none</Row>
            <Row label="Network fee">Shown on the next screen</Row>
          </div>
        )}
        {impactPct !== null && impactPct > 5 && <ErrorBox>Price impact above 5%: this pool has little liquidity for this size. Consider a smaller amount.</ErrorBox>}

        {needsApproval && (
          <div className="space-y-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-sm">
            <p>Uniswap needs permission to spend your {from.symbol}. Approve the exact amount (recommended) or unlimited.</p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-[#FF5C68]" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
              Unlimited approval (not recommended — the router could spend all your {from.symbol})
            </label>
            <button className="btn-primary w-full" onClick={approve}>
              Approve {unlimited ? 'unlimited' : `${amount} ${from.symbol}`}
            </button>
          </div>
        )}

        <button className="btn-primary w-full" disabled={!q || !!needsApproval || !parsed?.ok} onClick={swap}>
          Review swap
        </button>
        <p className="text-center text-xs text-mute">Quotes come from the on-chain Uniswap QuoterV2 and refresh every 20s.</p>
      </div>
      <TxFlow
        request={req}
        onClose={() => setReq(null)}
        onDone={() => {
          void allowance.refetch()
        }}
      />
    </div>
  )
}
