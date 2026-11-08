'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, ExternalLink, GraduationCap, Sparkles } from 'lucide-react'
import {
  SECURITY_QUESTS,
  WIF_ADDRESS,
  compareMetadata,
  DEFAULT_TOKENS,
  explorerAddressUrl,
  explorerTokenUrl,
  fetchExplorerToken,
  readTokenMetadata,
  type ChartRange,
} from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { fetchHistory, useActivity, useNetwork, usePortfolio, useTokenMarket } from '@/lib/hooks'
import { fmtPct, fmtToken, fmtUsd } from '@/lib/format'
import { ECOSYSTEM_APPS, LISTING_CRITERIA } from '@/lib/ecosystem'
import { withExplorer } from '@/lib/net'
import { AreaChart } from '@/components/Charts'
import { ActivityList } from '@/components/ActivityList'
import { Badge, CopyButton, ErrorBox, Notice, PageHeader, Row, Skeleton, cx } from '@/components/ui'

const WIF_LISTING = DEFAULT_TOKENS.robinhood.find((t) => t.isWif)!

export default function WifPage() {
  const { activeAccount, state, update } = useWallet()
  const { network, client } = useNetwork()
  const onMainnet = network.key === 'robinhood'
  const address = activeAccount?.address
  const { rows } = usePortfolio(address)
  const wifRow = rows.find((r) => r.token?.isWif)
  const [range, setRange] = useState<ChartRange>('30d')

  const meta = useQuery({
    queryKey: ['wif-meta', network.key],
    enabled: onMainnet,
    queryFn: async () => {
      const m = await readTokenMetadata(client, WIF_ADDRESS)
      return { meta: m, check: compareMetadata(WIF_LISTING, m) }
    },
    staleTime: 3_600_000,
  })
  const explorer = useQuery({ queryKey: ['wif-explorer'], enabled: onMainnet, queryFn: () => withExplorer(network.key, (n) => fetchExplorerToken(n, WIF_ADDRESS)), retry: 1 })
  const market = useTokenMarket(network, onMainnet ? WIF_ADDRESS : undefined)
  const history = useQuery({ queryKey: ['wif-history', range], enabled: onMainnet, queryFn: () => fetchHistory(network, WIF_ADDRESS, range), staleTime: 300_000, retry: 2, retryDelay: (n) => 3_000 * 2 ** n })
  const transfers = useActivity(onMainnet ? address : undefined, WIF_ADDRESS)

  const participation = transfers.data
    ? {
        count: transfers.data.length,
        first: transfers.data[transfers.data.length - 1]?.timestamp,
        received: transfers.data.filter((t) => t.direction === 'in').length,
        sent: transfers.data.filter((t) => t.direction === 'out').length,
      }
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="$WIF Ecosystem"
        subtitle="World Is Flat on Robinhood Chain. Optional, always — no InWIF feature ever requires holding or spending $WIF."
        actions={
          <>
            <Link href="/app/swap" className="btn-primary">Get $WIF</Link>
            <Link href="/app/send" className="btn-ghost">Send $WIF</Link>
            <Link href="/app/wif/live" className="btn-ghost"><span className="live-dot" /> Live market</Link>
            <Link href="/app/wif/card" className="btn-ghost">My $WIF card</Link>
          </>
        }
      />

      {!onMainnet && <Notice tone="warn">$WIF lives on Robinhood Chain mainnet. Switch network in the top bar to see live data.</Notice>}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-mute">Your $WIF balance</p>
              <p className="mt-1 font-display text-4xl font-extrabold">{wifRow ? fmtToken(wifRow.raw, wifRow.decimals, 2) : '—'} <span className="text-accent">WIF</span></p>
              <p className="text-sm text-mute">{fmtUsd(wifRow?.valueUsd)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-mute">Price</p>
              <p className="font-display text-2xl font-bold">{market.isLoading ? <Skeleton className="h-7 w-24" /> : fmtUsd(market.data?.priceUsd)}</p>
              <p className={cx('text-sm', (market.data?.change24hPct ?? 0) >= 0 ? 'text-ok' : 'text-bad')}>{fmtPct(market.data?.change24hPct)} 24h</p>
            </div>
          </div>
          <div className="mt-4 flex gap-1">
            {(['24h', '7d', '30d', '90d', 'all'] as ChartRange[]).map((r) => (
              <button key={r} className={cx('chip', range === r && 'border-accent/40 text-accent')} onClick={() => setRange(r)}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {history.isLoading ? <Skeleton className="h-48" /> : history.data && history.data.length > 1 ? <AreaChart data={history.data} label="$WIF price (USD)" /> : <Notice>{history.isError ? 'Price history is unavailable right now and will load shortly.' : 'No price history available yet.'}</Notice>}
          </div>
          <p className="mt-2 text-xs text-mute">Prices of low-liquidity tokens can move sharply.</p>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 font-display font-bold">
            Token information
            {meta.data?.check.matches && (
              <Badge tone="ok">
                <BadgeCheck className="h-3 w-3" /> verified on-chain
              </Badge>
            )}
          </h2>
          {meta.isError && <ErrorBox>Could not read the contract: {(meta.error as Error).message}</ErrorBox>}
          {meta.data && !meta.data.check.matches && <ErrorBox>{meta.data.check.issues.join(' ')}</ErrorBox>}
          <Row label="Name">{meta.data?.meta.name ?? '…'}</Row>
          <Row label="Symbol">{meta.data?.meta.symbol ?? '…'}</Row>
          <Row label="Decimals">{meta.data?.meta.decimals ?? '…'}</Row>
          <Row label="Total supply">{meta.data ? fmtToken(meta.data.meta.totalSupply, meta.data.meta.decimals, 0) : '…'}</Row>
          <Row label="Holders">{explorer.data?.holders ? Number(explorer.data.holders).toLocaleString() : '—'}</Row>
          <Row label="Liquidity">{fmtUsd(market.data?.liquidityUsd, { compact: true })}</Row>
          <Row label="24h volume">{fmtUsd(market.data?.volume24hUsd, { compact: true })}</Row>
          <Row label="FDV">{fmtUsd(market.data?.fdvUsd, { compact: true })}</Row>
          <div className="mt-3 rounded-xl bg-ink-900 p-3">
            <p className="label">Contract</p>
            <p className="break-all font-mono text-xs">{WIF_ADDRESS}</p>
            <div className="mt-2 flex gap-2">
              <CopyButton value={WIF_ADDRESS} />
              <a className="btn-ghost px-3 py-1.5 text-xs" href={explorerTokenUrl(network, WIF_ADDRESS)} target="_blank" rel="noreferrer">
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </section>
      </div>

      <section className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Sparkles className="h-5 w-5 text-accent" /> Powered by the World Is Flat Ecosystem
        </h2>
        <div className="mt-3 grid gap-4 text-sm text-mute md:grid-cols-3">
          <p>
            <span className="font-semibold text-white">InWIF is a free gateway.</span> It gives every World Is Flat community member a secure, self-custody home for $WIF on Robinhood
            Chain — with hardware-grade signing on the way.
          </p>
          <p>
            <span className="font-semibold text-white">$WIF is the ecosystem token, not a toll.</span> Holding $WIF unlocks nothing extra in InWIF: every wallet, security and
            portfolio feature is identical for every user.
          </p>
          <p>
            <span className="font-semibold text-white">Utility is real and on-chain.</span> Track $WIF, trade it, audit its approvals, build an
            on-chain ecosystem profile, and discover reviewed apps built around it.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">Your ecosystem profile</h2>
          <Row label="Address">
            <a className="font-mono text-xs hover:text-accent" href={address && explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
              {address}
            </a>
          </Row>
          <Row label="$WIF balance">{wifRow ? `${fmtToken(wifRow.raw, wifRow.decimals, 2)} WIF` : '—'}</Row>
          <Row label="$WIF transfers">{participation ? `${participation.count} (${participation.received} in · ${participation.sent} out)` : '—'}</Row>
          <Row label="First $WIF activity">{participation?.first ? new Date(participation.first).toLocaleDateString() : '—'}</Row>
          <Row label="Security quests">{Object.keys(state.quests).length} / {SECURITY_QUESTS.length}</Row>
          <p className="mt-3 text-xs text-mute">Built only from public on-chain data and your local quest progress. Nothing is uploaded.</p>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
            <GraduationCap className="h-5 w-5 text-accent" /> Security quests
          </h2>
          <p className="mb-3 text-xs text-mute">Free learning tasks. Completing them is tracked on this device only and does not by itself earn tokens.</p>
          <ul className="space-y-2">
            {SECURITY_QUESTS.map((q) => {
              const done = !!state.quests[q.id]
              return (
                <li key={q.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] p-3">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#00E59B]"
                    checked={done}
                    aria-label={q.title}
                    onChange={() =>
                      update((s) => {
                        const quests = { ...s.quests }
                        if (done) delete quests[q.id]
                        else quests[q.id] = Date.now()
                        return { ...s, quests }
                      })
                    }
                  />
                  <div>
                    <p className={cx('text-sm font-medium', done && 'text-mute line-through')}>{q.title}</p>
                    <p className="text-xs text-mute">{q.body}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-2 font-display font-bold">Your $WIF transfer history</h2>
        <ActivityList items={transfers.data} loading={transfers.isLoading} error={transfers.error as Error | null} emptyText="No $WIF transfers for this address yet." />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display font-bold">Ecosystem applications</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {ECOSYSTEM_APPS.map((a) => (
            <Link key={a.id} href={a.href} className="rounded-xl border border-white/[0.06] p-4 hover:border-accent/30">
              <p className="font-semibold">{a.name}</p>
              <p className="mt-1 text-xs text-mute">{a.description}</p>
            </Link>
          ))}
        </div>
        <details className="mt-4 text-sm text-mute">
          <summary className="cursor-pointer">How third-party $WIF apps get listed</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {LISTING_CRITERIA.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}
