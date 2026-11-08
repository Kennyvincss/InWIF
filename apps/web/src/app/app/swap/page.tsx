'use client'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { ArrowDownUp } from 'lucide-react'
import {
  MARKET_BLOCK_FRACTION,
  NATIVE,
  buildRouteSwapTx,
  compareWithMarket,
  getBestRouteQuote,
  minimumReceived,
  parseAmount,
  swapApprovalSteps,
  verifyUniswapDeployment,
  verifyUniswapV4Deployment,
  type SwapQuote,
  type SwapToken,
} from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useNetwork, usePortfolio, useTokens } from '@/lib/hooks'
import { fmtToken, fmtUsd } from '@/lib/format'
import { TxFlow, type TxRequest } from '@/components/TxFlow'
import { ErrorBox, Notice, PageHeader, PercentButtons, Row, Spinner, TokenPicker, cx } from '@/components/ui'
import { percentOf, useGasReserve } from '@/lib/amount'

const SLIPPAGES = [10, 50, 100, 300]

export default function SwapPage() {
  const { activeAccount, state, update } = useWallet()
  const { network, client } = useNetwork()
  const tokens = useTokens()
  const { rows } = usePortfolio(activeAccount?.address)
  const cfg = network.uniswapV3
  const v4cfg = network.uniswapV4
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
  const balOf = (k: SwapToken) => rows.find((r) => r.key === (k === NATIVE ? 'native' : k))
  const pickerOptions = options.map((o) => {
    const b = balOf(o.key)
    return { key: o.key as string, symbol: o.symbol, detail: b ? fmtToken(b.raw, b.decimals) : undefined }
  })
  // Keep the network fee back when filling from ETH (a swap uses up to ~300,000 gas).
  const reserve = useGasReserve(300_000n)
  const available = bal ? (fromKey === NATIVE ? (reserve === undefined ? undefined : bal.raw > reserve ? bal.raw - reserve : 0n) : bal.raw) : undefined
  const parsed = debounced ? parseAmount(debounced, from.decimals, bal?.raw) : null

  // Only route through contracts confirmed to exist on this chain.
  const deployment = useQuery({
    queryKey: ['uni-deploy', network.key],
    enabled: !!cfg || !!v4cfg,
    queryFn: async () => {
      const [v3, v4] = await Promise.all([cfg ? verifyUniswapDeployment(client, cfg) : null, v4cfg ? verifyUniswapV4Deployment(client, v4cfg) : null])
      return { v3: !!v3?.ok, v4: !!v4?.ok, ok: !!v3?.ok || !!v4?.ok, partial: (!!cfg && !v3?.ok) || (!!v4cfg && !v4?.ok) }
    },
    staleTime: 3_600_000,
  })
  const cfgs = useMemo(
    () => ({ v3: deployment.data?.v3 ? cfg : undefined, v4: deployment.data?.v4 ? v4cfg : undefined }),
    [deployment.data, cfg, v4cfg],
  )

  const quote = useQuery({
    queryKey: ['quote', network.key, fromKey, toKey, parsed?.raw?.toString(), deployment.data?.v3, deployment.data?.v4],
    enabled: deployment.data?.ok === true && !!parsed?.raw && fromKey !== toKey,
    queryFn: () => getBestRouteQuote(client, cfgs, fromKey, toKey, parsed!.raw!),
    refetchInterval: 20_000,
    retry: false,
  })

  // While the typed amount is still settling, the quote and approvals belong to the old amount:
  // hold the buttons so nobody approves or swaps an amount they no longer see.
  const settling = amount !== debounced || (!!parsed?.raw && !!quote.data && quote.data.amountIn !== parsed.raw)
  const q: SwapQuote | undefined = settling ? undefined : quote.data
  const approvals = useQuery({
    queryKey: ['swap-approvals', network.key, fromKey, q?.protocol, q?.amountIn.toString(), activeAccount?.address, unlimited],
    enabled: !!q && fromKey !== NATIVE && !!activeAccount,
    queryFn: () => swapApprovalSteps(client, q!, activeAccount!.address, { ...cfgs, unlimited, symbol: from.symbol }),
  })
  const steps = fromKey === NATIVE ? [] : approvals.data
  const needsApproval = fromKey !== NATIVE && !!q && (steps === undefined || steps.length > 0)
  const impactPct = q?.priceImpact !== null && q?.priceImpact !== undefined ? q.priceImpact * 100 : null
  const priceOf = (k: SwapToken) => rows.find((r) => r.key === (k === NATIVE ? 'native' : k))?.priceUsd ?? null
  const toPrice = priceOf(toKey)
  const market = q
    ? compareWithMarket({ amountIn: q.amountIn, decimalsIn: from.decimals, priceInUsd: priceOf(fromKey), amountOut: q.amountOut, decimalsOut: to.decimals, priceOutUsd: toPrice })
    : null
  const blocked = market?.level === 'block'

  if (!cfg && !v4cfg)
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Swap" />
        <Notice>Swaps are not available on {network.name}.</Notice>
      </div>
    )

  function approve() {
    const step = steps?.[0]
    if (!step) return
    setReq({ to: step.to, data: step.data, summary: step.summary, kind: 'approve' })
  }

  function swap() {
    if (!q || !activeAccount || blocked) return
    const tx = buildRouteSwapTx(cfgs, q, activeAccount.address, slippageBps, 20 * 60)
    setReq({ to: tx.to, data: tx.data, value: tx.value, summary: `Swap ${amount} ${from.symbol} → ${to.symbol}`, kind: 'swap' })
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Swap" subtitle="Swap at the best available price. InWIF adds no fee." />
      <div className="card space-y-4 p-6">
        {deployment.data && !deployment.data.ok && <ErrorBox>Swaps are unavailable right now. Please try again later.</ErrorBox>}

        <div className="rounded-2xl bg-ink-900 p-4">
          <div className="flex items-center justify-between text-xs text-mute">
            <span>You pay</span>
            <span>Balance {bal ? fmtToken(bal.raw, bal.decimals) : '—'}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input className="input min-w-0 flex-1 border-0 bg-transparent px-0 text-2xl focus:ring-0" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount to swap" />
            <TokenPicker
              className="w-36 shrink-0"
              label="From token"
              value={fromKey}
              options={pickerOptions}
              onChange={(k) => {
                if (k === toKey) setTo(fromKey)
                setFrom(k as SwapToken)
                setAmount('')
              }}
            />
          </div>
          <div className="mt-2">
            <PercentButtons disabled={available === undefined || available === 0n} onPick={(p) => available !== undefined && setAmount(percentOf(available, from.decimals, p, fromKey !== NATIVE))} />
          </div>
          {fromKey === NATIVE && <p className="mt-1 text-xs text-mute">100% keeps a little ETH back for the network fee.</p>}
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
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-2xl">{(quote.isFetching || (settling && !!amount)) && !q ? <Spinner /> : q ? fmtToken(q.amountOut, to.decimals) : '0.0'}</div>
            <TokenPicker
              className="w-36 shrink-0"
              label="To token"
              value={toKey}
              options={pickerOptions}
              onChange={(k) => {
                if (k === fromKey) setFrom(toKey)
                setTo(k as SwapToken)
              }}
            />
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
            <Row label="Trading fee">{q.poolFeeFraction !== null && q.poolFeeFraction !== undefined ? `${(q.poolFeeFraction * 100).toFixed(2)}%` : 'unknown'}</Row>
            <Row label="Vs. market price">
              {market?.loss === null || market?.loss === undefined ? (
                <span className="text-mute">no market price to compare</span>
              ) : (
                <span className={cx(market.level === 'block' && 'font-semibold text-bad', market.level === 'warn' && 'text-warn', market.level === 'ok' && 'text-ok')}>
                  {market.loss > 0 ? `${(market.loss * 100).toFixed(2)}% below` : `${(-market.loss * 100).toFixed(2)}% above`}
                </span>
              )}
            </Row>
            <Row label="InWIF fee">0 — none</Row>
            <Row label="Network fee">Shown on the next screen</Row>
          </div>
        )}
        {impactPct !== null && impactPct > 5 && <ErrorBox>Price impact above 5%: there is little liquidity for this size. Consider a smaller amount.</ErrorBox>}
        {blocked && (
          <ErrorBox>
            Swap blocked: you would get {((market!.loss ?? 0) * 100).toFixed(1)}% less than the market price (limit {MARKET_BLOCK_FRACTION * 100}%). The price available is far from the
            market, or there is too little liquidity for this size. Try a smaller amount, or try again later.
          </ErrorBox>
        )}
        {market?.level === 'warn' && <Notice tone="warn">You would get {((market.loss ?? 0) * 100).toFixed(1)}% less than the market price, including the trading fee and price impact.</Notice>}
        {q && market?.level === 'unknown' && <Notice>No market price is available to double-check this quote. Compare the rate yourself before you continue.</Notice>}

        {needsApproval && !blocked && (
          <div className="space-y-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-sm">
            {steps === undefined ? (
              <p>
                <Spinner /> Checking approvals…
              </p>
            ) : (
              <>
                <p>
                  Before swapping {from.symbol}, approve it for trading{steps.length > 1 ? ` (${steps.length} quick steps)` : ''}. By default only the exact amount is approved.
                </p>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="accent-[#FF5C68]" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
                  Unlimited token approval (not recommended — the spender could take all your {from.symbol})
                </label>
                <button className="btn-primary w-full" onClick={approve}>
                  {steps.length > 1 ? 'Step 1: ' : ''}
                  {steps[0]?.summary}
                </button>
              </>
            )}
          </div>
        )}

        <button className="btn-primary w-full" disabled={!q || needsApproval || !parsed?.ok || blocked} onClick={swap}>
          Review swap
        </button>
        <p className="text-center text-xs text-mute">Prices update every 20 seconds.</p>
      </div>
      <TxFlow
        request={req}
        onClose={() => setReq(null)}
        onDone={() => {
          void approvals.refetch()
        }}
      />
    </div>
  )
}
