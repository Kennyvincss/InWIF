'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, ExternalLink, Fish, Radio } from 'lucide-react'
import { WIF_ADDRESS, explorerTxUrl, fetchExplorerToken, shortAddress, tradeFlow, type PoolTrade } from '@inwif/core'
import { useNetwork, useTokenMarket } from '@/lib/hooks'
import { market as marketApi } from '@/lib/market-client'
import { withExplorer } from '@/lib/net'
import { useNotify } from '@/lib/notifications'
import { fmtPct, fmtUsd } from '@/lib/format'
import { Notice, PageHeader, Skeleton, TokenIcon, cx } from '@/components/ui'

type Win = 'm5' | 'h1' | 'h6' | 'h24'
const WINDOWS: { k: Win; label: string; ms: number }[] = [
  { k: 'm5', label: '5M', ms: 5 * 60_000 },
  { k: 'h1', label: '1H', ms: 3_600_000 },
  { k: 'h6', label: '6H', ms: 6 * 3_600_000 },
  { k: 'h24', label: '24H', ms: 24 * 3_600_000 },
]
const WHALE_LEVELS = [50, 100, 500]

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)
const ethFmt = (n: number) => (n >= 1 ? n.toFixed(3) : n.toPrecision(3))

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{children}</p>
}

export default function LiveWifPage() {
  const { network } = useNetwork()
  const onMainnet = network.key === 'robinhood' && !!network.geckoTerminalNetwork
  const notify = useNotify()
  const market = useTokenMarket(network, onMainnet ? WIF_ADDRESS : undefined)
  const pool = market.data?.topPool
  const [win, setWin] = useState<Win>('h1')
  const [whaleUsd, setWhaleUsd] = useState(100)
  const [whalesOnly, setWhalesOnly] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const trades = useQuery({
    queryKey: ['live-trades', pool],
    enabled: onMainnet && !!pool,
    queryFn: () => marketApi.trades(network.geckoTerminalNetwork!, pool!),
    refetchInterval: 10_000,
    retry: 1,
  })
  const stats = useQuery({
    queryKey: ['live-pool', pool],
    enabled: onMainnet && !!pool,
    queryFn: () => marketApi.pool(network.geckoTerminalNetwork!, pool!),
    refetchInterval: 20_000,
    retry: 1,
  })
  const holders = useQuery({
    queryKey: ['wif-explorer'],
    enabled: onMainnet,
    queryFn: () => withExplorer(network.key, (n) => fetchExplorerToken(n, WIF_ADDRESS)),
    staleTime: 300_000,
    retry: 1,
  })

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Flash trades that arrived since the last refresh; announce new whales (not the initial load).
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  useEffect(() => {
    const list = trades.data
    if (!list) return
    const key = (t: PoolTrade) => `${t.txHash}:${t.kind}:${t.baseAmount}`
    if (seen.current === null) {
      seen.current = new Set(list.map(key))
      return
    }
    const added = list.filter((t) => !seen.current!.has(key(t)))
    added.forEach((t) => seen.current!.add(key(t)))
    if (!added.length) return
    setFresh(new Set(added.map(key)))
    const timer = setTimeout(() => setFresh(new Set()), 2500)
    for (const t of added.filter((x) => x.volumeUsd >= whaleUsd).slice(0, 3)) {
      notify.push({
        type: 'swaps',
        title: `Whale ${t.kind}: ${compact(t.baseAmount)} WIF`,
        body: `${fmtUsd(t.volumeUsd)} · ${ethFmt(t.quoteAmount)} ETH`,
        href: explorerTxUrl(network, t.txHash),
      })
    }
    return () => clearTimeout(timer)
  }, [trades.data, whaleUsd, notify, network])

  const windowMs = WINDOWS.find((w) => w.k === win)!.ms
  const flow = useMemo(() => tradeFlow(trades.data ?? [], now - windowMs), [trades.data, now, windowMs])
  const w = stats.data?.windows[win]
  const h24 = stats.data?.windows.h24
  const whales = (trades.data ?? []).filter((t) => t.volumeUsd >= whaleUsd)
  const feed = (whalesOnly ? whales : trades.data ?? []).slice(0, 60)
  const updatedAgo = trades.dataUpdatedAt ? Math.round((now - trades.dataUpdatedAt) / 1000) : null
  const price = stats.data?.priceUsd ?? market.data?.priceUsd ?? null
  const buyPct = flow.buyShare === null ? null : Math.round(flow.buyShare * 100)

  if (!onMainnet)
    return (
      <div>
        <PageHeader title="Live $WIF" />
        <Notice tone="warn">$WIF trades on Robinhood Chain mainnet. Switch network in the top bar to see the live market.</Notice>
      </div>
    )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live $WIF"
        subtitle="Every trade in the main $WIF market, as it happens."
        actions={
          <>
            <Link href="/app/wif" className="btn-ghost">
              $WIF overview
            </Link>
            <Link href="/app/swap" className="btn-primary">
              Trade $WIF
            </Link>
          </>
        }
      />

      {/* TICKER */}
      <section className="card relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(0,229,155,.14),transparent)]" />
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="flex items-center gap-3">
            <TokenIcon symbol="WIF" size={44} />
            <div>
              <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
                <span className="live-dot" /> Live · {updatedAgo === null ? 'connecting' : `updated ${updatedAgo}s ago`}
              </p>
              <p className="font-display text-3xl font-semibold">{price ? fmtUsd(price) : '—'}</p>
            </div>
          </div>
          {[
            { k: '24h change', v: fmtPct(h24?.priceChangePct ?? market.data?.change24hPct), tone: (h24?.priceChangePct ?? 0) >= 0 ? 'text-accent' : 'text-bad' },
            { k: '24h volume', v: fmtUsd(h24?.volumeUsd ?? market.data?.volume24hUsd, { compact: true }) },
            { k: 'Liquidity', v: fmtUsd(stats.data?.liquidityUsd ?? market.data?.liquidityUsd, { compact: true }) },
            { k: 'Holders', v: holders.data?.holders ? Number(holders.data.holders).toLocaleString() : '—' },
            { k: '24h trades', v: h24 ? (h24.buys + h24.sells).toLocaleString() : '—' },
            { k: '24h traders', v: h24 && h24.buyers !== null && h24.sellers !== null ? (h24.buyers + h24.sellers).toLocaleString() : '—' },
          ].map((s) => (
            <div key={s.k}>
              <Label>{s.k}</Label>
              <p className={cx('mt-1 text-lg font-medium', s.tone)}>{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* PRESSURE */}
        <section className="card p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <Label>Buy vs sell pressure</Label>
            <div className="flex rounded-full border border-white/[0.08] bg-black/40 p-0.5 font-mono text-[11px]">
              {WINDOWS.map((x) => (
                <button key={x.k} className={cx('rounded-full px-2.5 py-1 transition', win === x.k ? 'bg-white text-black' : 'text-mute hover:text-white')} onClick={() => setWin(x.k)}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          {trades.isLoading ? (
            <Skeleton className="mt-6 h-32" />
          ) : (
            <>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <p className={cx('font-display text-5xl font-semibold', buyPct === null ? 'text-mute' : buyPct >= 50 ? 'text-accent' : 'text-bad')}>{buyPct === null ? '—' : `${buyPct}%`}</p>
                  <p className="mt-1 text-sm text-mute">{buyPct === null ? 'No trades in this window yet' : buyPct >= 50 ? 'of the volume is buying' : 'of the volume is buying — sellers lead'}</p>
                </div>
                <Radio className={cx('h-6 w-6', buyPct !== null && buyPct >= 50 ? 'text-accent' : 'text-bad')} />
              </div>
              <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="bg-accent shadow-[0_0_12px_rgba(0,229,155,.7)] transition-[width] duration-500" style={{ width: `${buyPct ?? 0}%` }} />
                <div className="bg-bad/90 transition-[width] duration-500" style={{ width: `${buyPct === null ? 0 : 100 - buyPct}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-3">
                  <Label>Buys</Label>
                  <p className="mt-1 font-medium text-accent">{fmtUsd(flow.buyUsd)}</p>
                  <p className="text-xs text-dim">{(w?.buys ?? flow.buys).toLocaleString()} trades</p>
                </div>
                <div className="rounded-xl border border-bad/20 bg-bad/[0.05] p-3">
                  <Label>Sells</Label>
                  <p className="mt-1 font-medium text-bad">{fmtUsd(flow.sellUsd)}</p>
                  <p className="text-xs text-dim">{(w?.sells ?? flow.sells).toLocaleString()} trades</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-dim">Volume split from the latest {(trades.data ?? []).length} trades; trade counts for the whole window.</p>
            </>
          )}
        </section>

        {/* WHALES */}
        <section className="card p-6 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2">
              <Fish className="h-4 w-4 text-cyan" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">Whale alerts</span>
            </p>
            <div className="flex items-center gap-2 text-xs text-mute">
              Over
              <div className="flex rounded-full border border-white/[0.08] bg-black/40 p-0.5 font-mono text-[11px]">
                {WHALE_LEVELS.map((v) => (
                  <button key={v} className={cx('rounded-full px-2.5 py-1 transition', whaleUsd === v ? 'bg-cyan text-black' : 'text-mute hover:text-white')} onClick={() => setWhaleUsd(v)}>
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {trades.isLoading && <Skeleton className="h-40" />}
            {!trades.isLoading && whales.length === 0 && <p className="py-10 text-center text-sm text-mute">No trades over ${whaleUsd.toLocaleString()} in the last day. You&apos;ll get an alert when one happens.</p>}
            {whales.slice(0, 6).map((t) => (
              <li key={`${t.txHash}:${t.kind}:${t.baseAmount}`} className="flex items-center gap-3 rounded-xl border border-cyan/15 bg-cyan/[0.03] px-3 py-2.5">
                <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', t.kind === 'buy' ? 'bg-accent/15 text-accent' : 'bg-bad/15 text-bad')}>
                  {t.kind === 'buy' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t.kind === 'buy' ? 'Bought' : 'Sold'} {compact(t.baseAmount)} WIF
                  </p>
                  <p className="font-mono text-[11px] text-dim">
                    {shortAddress(t.trader)} · {ago(t.timestamp, now)} ago
                  </p>
                </div>
                <p className="font-medium text-cyan">{fmtUsd(t.volumeUsd)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* TRADE FEED */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-6">
          <Label>Trade feed</Label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-mute">
            <input type="checkbox" className="accent-[#22E5FF]" checked={whalesOnly} onChange={(e) => setWhalesOnly(e.target.checked)} />
            Whales only
          </label>
        </div>
        <div className="hidden grid-cols-[4rem,4.5rem,1fr,1fr,1fr,8rem] gap-3 border-y border-white/[0.06] bg-white/[0.015] px-6 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-dim md:grid">
          <span>Age</span>
          <span>Side</span>
          <span className="text-right">WIF</span>
          <span className="text-right">ETH</span>
          <span className="text-right">Value</span>
          <span className="text-right">Trader</span>
        </div>
        {trades.isError && (
          <div className="px-6 py-6">
            <Notice>The live feed is unavailable right now and will reconnect shortly.</Notice>
          </div>
        )}
        {trades.isLoading && (
          <div className="px-6 pb-6">
            <Skeleton className="h-64" />
          </div>
        )}
        <ul className="divide-y divide-white/[0.04]">
          {feed.map((t) => {
            const k = `${t.txHash}:${t.kind}:${t.baseAmount}`
            const whale = t.volumeUsd >= whaleUsd
            return (
              <li
                key={k}
                className={cx(
                  'grid grid-cols-[3rem,1fr,auto] items-center gap-3 px-6 py-2.5 text-sm transition-colors duration-700 md:grid-cols-[4rem,4.5rem,1fr,1fr,1fr,8rem]',
                  fresh.has(k) ? (t.kind === 'buy' ? 'bg-accent/[0.12]' : 'bg-bad/[0.12]') : 'hover:bg-white/[0.02]',
                )}
              >
                <span className="font-mono text-xs text-dim">{ago(t.timestamp, now)}</span>
                <span className="flex items-center gap-1.5">
                  <span className={cx('rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase', t.kind === 'buy' ? 'bg-accent/15 text-accent' : 'bg-bad/15 text-bad')}>{t.kind}</span>
                  {whale && <Fish className="h-3.5 w-3.5 text-cyan" aria-label="Whale" />}
                  <span className="text-xs text-mute md:hidden">{compact(t.baseAmount)} WIF</span>
                </span>
                <span className="hidden text-right md:block">{compact(t.baseAmount)}</span>
                <span className="hidden text-right text-mute md:block">{ethFmt(t.quoteAmount)}</span>
                <span className={cx('text-right font-medium', whale && 'text-cyan')}>{fmtUsd(t.volumeUsd)}</span>
                <a
                  className="hidden items-center justify-end gap-1 text-right font-mono text-xs text-dim transition hover:text-white md:flex"
                  href={explorerTxUrl(network, t.txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(t.trader)} <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            )
          })}
        </ul>
        {!trades.isLoading && feed.length === 0 && !trades.isError && <p className="px-6 py-10 text-center text-sm text-mute">No trades to show yet.</p>}
      </section>
      <p className="text-xs text-dim">Live market data refreshes every 10 seconds. Prices of low-liquidity tokens can move sharply.</p>
    </div>
  )
}
