'use client'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Check, Cpu, Eye, EyeOff, KeyRound, Landmark, ShieldAlert, ShieldCheck } from 'lucide-react'
import { RANGE_QUERY, explorerAddressUrl, type ChartRange } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useActivity, usePortfolio, usePortfolioHistory, useVerification } from '@/lib/hooks'
import { useEthereumBalance } from '@/lib/ethereum'
import { formatEther } from 'viem'
import { fmtPct, fmtToken, fmtUsd, fmtValue, fmtWif } from '@/lib/format'
import { AllocationBar, AreaChart } from '@/components/Charts'
import { ActivityList } from '@/components/ActivityList'
import { BackupModal } from '@/components/BackupModal'
import { HARDWARE_ENABLED } from '@/lib/features'
import { AddressAvatar, Badge, Callout, CopyButton, ErrorBox, Notice, Skeleton, TokenIcon, cx } from '@/components/ui'

const RANGES = Object.keys(RANGE_QUERY) as ChartRange[]

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px]  text-dim font-medium">{children}</p>
}

export default function Dashboard() {
  const { activeWallet, activeAccount, state, update } = useWallet()
  const address = activeAccount?.address
  const { balances, rows, totals, network, prices } = usePortfolio(address)
  const l1 = useEthereumBalance(address)
  const activity = useActivity(address)
  const verification = useVerification()
  const [range, setRange] = useState<ChartRange>('7d')
  const [backupOpen, setBackupOpen] = useState(false)
  const history = usePortfolioHistory(rows, range)
  const hide = state.settings.hideBalances
  const mask = (s: string) => (hide ? '••••' : s)
  const wif = rows.find((r) => r.token?.isWif)
  const up = (totals.change24hPct ?? 0) >= 0
  const currency = state.settings.displayCurrency ?? 'WIF'
  const inWif = currency === 'WIF' && !!wif?.priceUsd
  const value = (usd: number | null | undefined) => fmtValue(usd, currency, wif?.priceUsd)
  // The chart follows the same setting; without $WIF price history it stays in USD.
  const chartInWif = currency === 'WIF' && !!history.data?.wif
  const chart = chartInWif ? history.data?.wif : history.data?.usd

  const actions = [
    { href: '/app/send', label: 'Send', icon: ArrowUpRight },
    { href: '/app/receive', label: 'Receive', icon: ArrowDownLeft },
    { href: '/app/swap', label: 'Swap', icon: ArrowLeftRight },
    { href: '/app/defi', label: 'Stake / DeFi', icon: Landmark },
    ...(HARDWARE_ENABLED ? [{ href: '/app/hardware', label: 'Hardware', icon: Cpu }] : []),
  ]

  const checks = [
    { ok: verification.data?.ok === true, t: 'Network verified' },
    { ok: activeWallet?.kind !== 'mnemonic' || !!activeWallet?.backedUp, t: 'Recovery phrase backed up' },
    { ok: state.settings.autoLockMinutes <= 15, t: 'Auto-lock on' },
  ]

  return (
    <div className="space-y-4">
      {activeWallet && !activeWallet.backedUp && activeWallet.kind === 'mnemonic' && (
        <>
          <Callout
            tone="warn"
            icon={<KeyRound className="h-4 w-4" />}
            title="Back up your recovery phrase"
            action={
              <button className="btn-primary" onClick={() => setBackupOpen(true)}>
                Back up now
              </button>
            }
          >
            It is the only way to restore this wallet if you lose this device or clear your browser. Do it before adding funds.
          </Callout>
          <BackupModal walletId={activeWallet.id} open={backupOpen} onClose={() => setBackupOpen(false)} />
        </>
      )}
      {!!l1.data && l1.data > 0n && (
        <Callout
          tone="info"
          title={`You also have ${Number(formatEther(l1.data)).toLocaleString('en-US', { maximumFractionDigits: 6 })} ETH on Ethereum`}
          action={
            activeWallet?.kind !== 'watch' ? (
              <Link href="/app/bridge" className="btn-primary">
                Move to Robinhood Chain
              </Link>
            ) : undefined
          }
          data-testid="l1-banner"
        >
          InWIF runs on Robinhood Chain, so ETH on Ethereum doesn&apos;t count here yet. Move it over to use it, for example to pay network fees.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* BALANCE */}
        <section className="card relative overflow-hidden p-6 sm:p-8 lg:col-span-8">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label>Total balance</Label>
              {activeWallet?.kind === 'hardware' && <Badge tone="lime">Hardware</Badge>}
              {activeWallet?.kind === 'watch' && <Badge>Watch-only</Badge>}
              <button
                aria-label={hide ? 'Show balances' : 'Hide balances'}
                className="rounded-full p-1 text-dim transition hover:bg-fg/[0.06] hover:text-fg"
                onClick={() => update((s) => ({ ...s, settings: { ...s.settings, hideBalances: !s.settings.hideBalances } }))}
              >
                {hide ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <div className="flex rounded-full border border-fg/[0.08] bg-ink-900 p-0.5 font-mono text-[10.5px]" role="group" aria-label="Show balance in">
                {(['WIF', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    aria-pressed={currency === c}
                    className={cx('rounded-full px-2.5 py-0.5 transition', currency === c ? 'bg-fg text-paper' : 'text-mute hover:text-fg')}
                    onClick={() => update((s) => ({ ...s, settings: { ...s.settings, displayCurrency: c } }))}
                  >
                    {c === 'WIF' ? '$WIF' : 'USD'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 rounded-full border border-fg/[0.08] bg-ink-900 py-1 pl-1 pr-1 sm:w-auto sm:max-w-[22rem]">
              <AddressAvatar address={address} size={26} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-mute">{address}</span>
              {address && <CopyButton value={address} />}
            </div>
          </div>

          <div className="relative mt-6">
            <div className="font-display text-[44px] font-semibold leading-none sm:text-[64px]">
              {balances.isLoading || prices.isLoading ? (
                <Skeleton className="h-14 w-72" />
              ) : inWif && totals.total !== null ? (
                <span data-testid="total-balance">
                  {mask(value(totals.total).replace(/ WIF$/, ''))}
                  <span className="ml-3 align-baseline text-[0.42em] font-medium text-accent">WIF</span>
                </span>
              ) : (
                <span data-testid="total-balance">{mask(fmtUsd(totals.total))}</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {inWif && totals.total !== null && <span className="text-mute">≈ {mask(fmtUsd(totals.total))}</span>}
              {totals.change24hPct !== null && (
                <span className={cx('rounded-full border px-2.5 py-0.5 font-mono text-xs', up ? 'border-transparent bg-[#E3F3EA] text-ok' : 'border-bad/30 bg-bad/10 text-bad')}>
                  {fmtPct(totals.change24hPct)}
                </span>
              )}
              {totals.change24hPct !== null && <span className="text-dim">past 24h</span>}
              <span className="text-dim">· {activeWallet?.name} · {activeAccount?.label}</span>
              {prices.isError ? (
                <span className="text-warn">Market data unavailable — showing token amounts only.</span>
              ) : totals.total === null && totals.unpriced.length > 0 ? (
                <span className="text-mute">No market price available for your assets on {network.name}.</span>
              ) : null}
            </div>
          </div>

          <div className="relative mt-8 flex flex-wrap gap-2">
            {actions.map(({ href, label, icon: Icon }, i) => (
              <Link key={href} href={href} className={cx(i === 0 ? 'btn-primary' : 'btn-ghost', 'min-w-[7.5rem] flex-1 whitespace-nowrap sm:flex-none')}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </section>

        {/* SIDE TILES */}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:col-span-4">
          <Link href="/app/wif" className="card group relative overflow-hidden p-6">
            <div className="relative flex items-center gap-3">
              <TokenIcon symbol="WIF" size={40} />
              <div className="min-w-0">
                <Label>World is Flat</Label>
                <p className="font-medium">$WIF</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-dim transition group-hover:translate-x-0.5 group-hover:text-fg" />
            </div>
            <div className="relative mt-5 flex items-end justify-between gap-3">
              <p className="font-display text-3xl font-semibold">{wif?.priceUsd ? fmtUsd(wif.priceUsd) : '—'}</p>
              {wif?.change24hPct !== null && wif?.change24hPct !== undefined && (
                <span className={cx('font-mono text-xs', wif.change24hPct >= 0 ? 'text-ok' : 'text-bad')}>{fmtPct(wif.change24hPct)} 24h</span>
              )}
            </div>
            <p className="relative mt-1 text-xs text-dim">You hold {wif ? mask(fmtToken(wif.raw, wif.decimals, 2)) : '0'} WIF</p>
          </Link>

          <Link href="/app/security" className="card group p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-accent">
                <ShieldCheck className="h-5 w-5 text-accent" />
              </span>
              <div>
                <Label>Security</Label>
                <p className="font-medium">
                  {checks.filter((c) => c.ok).length}/{checks.length} checks passed
                </p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-dim transition group-hover:translate-x-0.5 group-hover:text-fg" />
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {checks.map((c) => (
                <li key={c.t} className={cx('flex items-center gap-2', c.ok ? 'text-mute' : 'text-warn')}>
                  {c.ok ? <Check className="h-3.5 w-3.5 text-accent" /> : <ShieldAlert className="h-3.5 w-3.5" />} {c.t}
                </li>
              ))}
            </ul>
          </Link>
        </div>

        {/* CHART */}
        <section className="card p-6 lg:col-span-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label>Portfolio value</Label>
              <p className="mt-1 text-sm text-mute">Your current holdings at past prices{chartInWif ? ", in $WIF" : ""}.</p>
            </div>
            <div className="flex rounded-full border border-fg/[0.08] bg-ink-900 p-0.5 font-mono text-[11px]">
              {RANGES.map((r) => (
                <button
                  key={r}
                  className={cx('rounded-full px-3 py-1 transition', range === r ? 'bg-fg text-paper' : 'text-mute hover:text-fg')}
                  onClick={() => setRange(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {history.isLoading ? (
            <Skeleton className="h-52" />
          ) : chart && chart.length > 1 && !hide ? (
            <AreaChart data={chart} label="Portfolio value" height={220} format={chartInWif ? (v) => `${fmtWif(v)} WIF` : undefined} />
          ) : (
            <Notice>
              {hide
                ? 'Balances hidden.'
                : history.isError
                  ? 'Price history is unavailable right now and will load shortly. Your balances are unaffected.'
                  : network.geckoTerminalNetwork
                    ? 'No price history available for the assets you hold. InWIF only charts real market data.'
                    : `Price history isn't available on ${network.name}.`}
            </Notice>
          )}
        </section>

        {/* ALLOCATION */}
        <section className="card p-6 lg:col-span-4">
          <Label>Allocation</Label>
          <div className="mt-4">
            {rows.some((r) => (r.valueUsd ?? 0) > 0) && !hide ? (
              <AllocationBar items={rows.map((r) => ({ label: r.symbol, value: r.valueUsd ?? 0 }))} />
            ) : (
              <p className="text-sm text-mute">Allocation appears once you hold priced assets.</p>
            )}
          </div>
          {totals.unpriced.length > 0 && <p className="mt-4 text-xs text-dim">Not included (no market price): {totals.unpriced.map((u) => u.symbol).join(', ')}</p>}
        </section>

        {/* ASSETS */}
        <section className="card overflow-hidden lg:col-span-8">
          <div className="flex items-center justify-between px-6 pb-3 pt-6">
            <Label>Assets</Label>
            <span className="chip">{network.name}</span>
          </div>
          {balances.isError && (
            <div className="px-6">
              <ErrorBox>Could not read balances: {(balances.error as Error).message}</ErrorBox>
            </div>
          )}
          {balances.isLoading && (
            <div className="px-6 pb-6">
              <Skeleton className="h-40" />
            </div>
          )}
          <div className="hidden grid-cols-[1.6fr,1fr,0.7fr,1.2fr] gap-4 border-y border-line bg-ink-900 px-6 py-2 text-[11.5px]  text-dim md:grid font-medium">
            <span>Asset</span>
            <span className="text-right">Price</span>
            <span className="text-right">24h</span>
            <span className="text-right">Holdings</span>
          </div>
          <ul className="divide-y divide-fg/[0.05]">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[1fr,auto] items-center gap-4 px-6 py-3.5 transition hover:bg-fg/[0.02] md:grid-cols-[1.6fr,1fr,0.7fr,1.2fr]">
                <div className="flex min-w-0 items-center gap-3">
                  <TokenIcon symbol={r.symbol} size={34} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {r.name}
                      {r.token?.isWif && <Badge tone="lime">Ecosystem</Badge>}
                    </p>
                    <p className="text-xs text-dim">
                      {r.symbol}
                      <span className="md:hidden">
                        {' '}
                        · {r.priceUsd !== null ? fmtUsd(r.priceUsd) : 'no market price'}{' '}
                        {r.change24hPct !== null && <span className={r.change24hPct >= 0 ? 'text-ok' : 'text-bad'}>{fmtPct(r.change24hPct)}</span>}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="hidden text-right text-sm text-mute md:block">{r.priceUsd !== null ? fmtUsd(r.priceUsd) : '—'}</p>
                <p className={cx('hidden text-right font-mono text-xs md:block', r.change24hPct === null ? 'text-dim' : r.change24hPct >= 0 ? 'text-ok' : 'text-bad')}>
                  {r.change24hPct !== null ? fmtPct(r.change24hPct) : '—'}
                </p>
                <div className="text-right">
                  <p className="font-medium">{mask(fmtToken(r.raw, r.decimals))}</p>
                  <p className="text-xs text-dim">{mask(r.token?.isWif ? fmtUsd(r.valueUsd) : value(r.valueUsd))}</p>
                </div>
              </li>
            ))}
          </ul>
          {balances.data?.errors.length ? (
            <p className="flex items-center gap-1 px-6 py-3 text-xs text-warn">
              <ShieldAlert className="h-3 w-3" /> Could not read {balances.data.errors.map((e) => e.token.symbol).join(', ')} on this network.
            </p>
          ) : null}
        </section>

        {/* ACTIVITY */}
        <section className="card p-6 lg:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <Label>Recent activity</Label>
            <div className="flex gap-3">
              {address && explorerAddressUrl(network, address) && (
                <a className="text-xs text-dim transition hover:text-fg" href={explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
                  Explorer ↗
                </a>
              )}
              <Link href="/app/activity" className="text-xs text-accent transition hover:text-accent-soft">
                View all
              </Link>
            </div>
          </div>
          <ActivityList items={activity.data} loading={activity.isLoading} error={activity.error as Error | null} limit={6} />
        </section>
      </div>
    </div>
  )
}
