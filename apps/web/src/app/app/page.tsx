'use client'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Cpu, Eye, EyeOff, Landmark, ShieldAlert } from 'lucide-react'
import { RANGE_QUERY, explorerAddressUrl, type ChartRange } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useActivity, usePortfolio, usePortfolioHistory } from '@/lib/hooks'
import { fmtPct, fmtToken, fmtUsd } from '@/lib/format'
import { AllocationBar, AreaChart } from '@/components/Charts'
import { ActivityList } from '@/components/ActivityList'
import { Badge, CopyButton, ErrorBox, Notice, Skeleton, TokenIcon, cx } from '@/components/ui'

const RANGES = Object.keys(RANGE_QUERY) as ChartRange[]

export default function Dashboard() {
  const { activeWallet, activeAccount, state, update } = useWallet()
  const address = activeAccount?.address
  const { balances, rows, totals, network, prices } = usePortfolio(address)
  const activity = useActivity(address)
  const [range, setRange] = useState<ChartRange>('7d')
  const history = usePortfolioHistory(rows, range)
  const hide = state.settings.hideBalances
  const mask = (s: string) => (hide ? '••••' : s)

  const actions = [
    { href: '/app/send', label: 'Send', icon: ArrowUpRight },
    { href: '/app/receive', label: 'Receive', icon: ArrowDownLeft },
    { href: '/app/swap', label: 'Swap', icon: ArrowLeftRight },
    { href: '/app/defi', label: 'Stake / DeFi', icon: Landmark },
    { href: '/app/hardware', label: 'Hardware', icon: Cpu },
  ]

  return (
    <div className="space-y-6">
      {activeWallet && !activeWallet.backedUp && (
        <ErrorBox>
          This wallet&apos;s recovery phrase has not been verified. <Link href="/app/wallets" className="underline">Back it up now</Link>.
        </ErrorBox>
      )}

      <section className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-lime/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-mute">
              {activeWallet?.name} · {activeAccount?.label}
              {activeWallet?.kind === 'hardware' && <Badge tone="lime">Hardware</Badge>}
              {activeWallet?.kind === 'watch' && <Badge>Watch-only</Badge>}
              <button
                aria-label={hide ? 'Show balances' : 'Hide balances'}
                className="rounded p-1 hover:text-white"
                onClick={() => update((s) => ({ ...s, settings: { ...s.settings, hideBalances: !s.settings.hideBalances } }))}
              >
                {hide ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              {balances.isLoading || prices.isLoading ? <Skeleton className="h-12 w-56" /> : mask(fmtUsd(totals.total))}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              {totals.change24hPct !== null && <span className={totals.change24hPct >= 0 ? 'text-ok' : 'text-bad'}>{fmtPct(totals.change24hPct)} 24h</span>}
              {prices.isError && <span className="text-warn">Market data unavailable — showing token amounts only.</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3 py-2">
            <span className="font-mono text-xs text-mute">{address}</span>
            {address && <CopyButton value={address} />}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2">
          {actions.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="group flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-3 text-xs font-medium hover:border-lime/30 hover:bg-lime/[0.05]">
              <Icon className="h-5 w-5 text-lime transition group-hover:scale-110" />
              <span className="text-center">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold">Portfolio value</h2>
              <p className="text-xs text-mute">Current holdings valued at historical prices (GeckoTerminal).</p>
            </div>
            <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
              {RANGES.map((r) => (
                <button key={r} className={cx('rounded-md px-2 py-1', range === r ? 'bg-white/10 text-white' : 'text-mute')} onClick={() => setRange(r)}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {history.isLoading ? (
            <Skeleton className="h-48" />
          ) : history.data && history.data.length > 1 && !hide ? (
            <AreaChart data={history.data} label="Portfolio value" />
          ) : (
            <Notice>
              {hide
                ? 'Balances hidden.'
                : network.geckoTerminalNetwork
                  ? 'No price history available for the assets you hold. InWIF only charts real market data.'
                  : `${network.name} has no market data source.`}
            </Notice>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display font-bold">Allocation</h2>
          {rows.some((r) => (r.valueUsd ?? 0) > 0) && !hide ? (
            <AllocationBar items={rows.map((r) => ({ label: r.symbol, value: r.valueUsd ?? 0 }))} />
          ) : (
            <p className="text-sm text-mute">Allocation appears once you hold priced assets.</p>
          )}
          {totals.unpriced.length > 0 && (
            <p className="mt-4 text-xs text-mute">Not included (no market price): {totals.unpriced.map((u) => u.symbol).join(', ')}</p>
          )}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display font-bold">Assets</h2>
          <span className="chip">{network.name}</span>
        </div>
        {balances.isError && <ErrorBox>Could not read balances: {(balances.error as Error).message}</ErrorBox>}
        {balances.isLoading && <Skeleton className="h-40" />}
        <ul className="divide-y divide-white/[0.05]">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 py-3">
              <TokenIcon symbol={r.symbol} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {r.name}
                  {r.token?.isWif && <Badge tone="lime">Ecosystem</Badge>}
                </p>
                <p className="text-xs text-mute">
                  {r.symbol} · {r.priceUsd !== null ? fmtUsd(r.priceUsd) : 'no market price'}{' '}
                  {r.change24hPct !== null && <span className={r.change24hPct >= 0 ? 'text-ok' : 'text-bad'}>{fmtPct(r.change24hPct)}</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{mask(fmtToken(r.raw, r.decimals))}</p>
                <p className="text-xs text-mute">{mask(fmtUsd(r.valueUsd))}</p>
              </div>
            </li>
          ))}
        </ul>
        {balances.data?.errors.length ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-warn">
            <ShieldAlert className="h-3 w-3" /> Could not read {balances.data.errors.map((e) => e.token.symbol).join(', ')} on this network.
          </p>
        ) : null}
      </section>

      <section className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display font-bold">Recent activity</h2>
          <div className="flex gap-2">
            {address && explorerAddressUrl(network, address) && (
              <a className="text-xs text-mute hover:text-white" href={explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            )}
            <Link href="/app/activity" className="text-xs text-lime">
              View all
            </Link>
          </div>
        </div>
        <ActivityList items={activity.data} loading={activity.isLoading} error={activity.error as Error | null} limit={6} />
      </section>
    </div>
  )
}
