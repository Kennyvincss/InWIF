'use client'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, IdCard, Info, Route } from 'lucide-react'
import { journeyBadges } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useWifJourney } from '@/lib/journey'
import { fmtPct, fmtUsd, fmtWif } from '@/lib/format'
import { Empty, ErrorBox, PageHeader, Skeleton, TokenIcon, cx } from '@/components/ui'

const date = (t: number) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const daysAgo = (t: number) => Math.max(0, Math.floor((Date.now() / 1000 - t) / 86_400))

export default function JourneyPage() {
  const { activeAccount, state } = useWallet()
  const { journey: j, complete, currentPriceUsd, loading, error } = useWifJourney(activeAccount?.address)
  const hide = state.settings.hideBalances
  const mask = (s: string) => (hide ? '••••' : s)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="My $WIF journey" subtitle="Your average buy price, profit and loss, and badges, worked out from your own $WIF history." />
      {error && !j ? (
        <ErrorBox>Your $WIF history could not be loaded right now. Try again in a moment.</ErrorBox>
      ) : loading || !j ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
      ) : j.buys === 0 && j.holding === 0 ? (
        <div className="card p-6">
          <Empty icon={<Route className="h-5 w-5" />} title="Your journey starts with your first $WIF">
            Buy or receive $WIF and your average price, profit and badges appear here.{' '}
            <Link href="/app/swap" className="text-accent underline">Buy $WIF</Link>
          </Empty>
        </div>
      ) : (
        <Journey j={j} complete={complete} currentPriceUsd={currentPriceUsd} mask={mask} />
      )}
      <p className="flex items-start gap-2 text-xs text-dim">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Worked out on this device from your public $WIF transfers and the daily $WIF market price. Every $WIF you received counts at that day&apos;s price (including gifts);
        swap fees and slippage are not included. Not financial advice.
      </p>
    </div>
  )
}

function Journey({ j, complete, currentPriceUsd, mask }: { j: NonNullable<ReturnType<typeof useWifJourney>['journey']>; complete: boolean; currentPriceUsd: number | null; mask: (s: string) => string }) {
  const up = (j.pnlUsd ?? 0) >= 0
  const badges = journeyBadges(j, Date.now() / 1000)
  const vsAvg = j.avgCostUsd && currentPriceUsd ? ((currentPriceUsd - j.avgCostUsd) / j.avgCostUsd) * 100 : null
  const share = [
    'My $WIF journey on InWIF',
    j.firstIn !== null ? `Holding since ${date(j.firstIn)}` : null,
    j.pnlPct !== null ? `${j.pnlPct >= 0 ? '+' : ''}${j.pnlPct.toFixed(1)}% overall` : null,
    badges.length ? badges.map((b) => `${b.emoji} ${b.label}`).join(' · ') : null,
  ]
    .filter(Boolean)
    .join('\n')

  const stats = [
    { k: 'Average buy price', v: j.avgCostUsd !== null ? fmtUsd(j.avgCostUsd) : '—', sub: vsAvg !== null ? `Today ${fmtUsd(currentPriceUsd)} · ${fmtPct(vsAvg)}` : undefined, tone: vsAvg === null ? '' : vsAvg >= 0 ? 'text-accent' : 'text-bad' },
    { k: 'You hold', v: mask(`${fmtWif(j.holding)} WIF`), sub: mask(`Worth ${fmtUsd(currentPriceUsd !== null ? j.holding * currentPriceUsd : null)}`) },
    { k: 'Unrealised', v: mask(fmtUsd(j.unrealizedUsd)), sub: 'On what you still hold', tone: (j.unrealizedUsd ?? 0) >= 0 ? 'text-accent' : 'text-bad' },
    { k: 'Realised', v: mask(fmtUsd(j.realizedUsd)), sub: j.sells ? `From ${j.sells} ${j.sells === 1 ? 'sale' : 'sales'}` : 'Nothing sold yet', tone: j.realizedUsd >= 0 ? 'text-accent' : 'text-bad' },
    { k: 'First $WIF', v: j.firstIn !== null ? date(j.firstIn) : '—', sub: j.firstIn !== null ? `${daysAgo(j.firstIn)} days ago` : undefined },
    { k: 'Last sold', v: j.lastOut !== null ? date(j.lastOut) : 'Never 🙌', sub: j.lastOut !== null ? `${daysAgo(j.lastOut)} days ago` : 'Not a single $WIF sold' },
  ]

  return (
    <>
      <section className={cx('card relative overflow-hidden p-6 sm:p-8', up ? 'border-accent/25' : 'border-bad/25')} data-testid="journey-hero">
        <div className={cx('pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl', up ? 'bg-accent/15' : 'bg-bad/15')} />
        <div className="relative flex flex-wrap items-center gap-4">
          <TokenIcon symbol="WIF" size={52} />
          <div className="min-w-0 flex-1 basis-[14rem]">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{!complete || j.partial ? 'Estimated profit / loss · recent history' : 'Total profit / loss'}</p>
            <p className={cx('whitespace-nowrap font-display text-[40px] font-semibold leading-tight sm:text-[52px]', up ? 'text-accent' : 'text-bad')} data-testid="journey-pnl">
              {j.pnlUsd === null ? '—' : mask(`${up ? '+' : '−'}${fmtUsd(Math.abs(j.pnlUsd))}`)}
            </p>
            <p className="text-sm text-mute">
              {j.pnlPct !== null && <span className={up ? 'text-accent' : 'text-bad'}>{fmtPct(j.pnlPct)}</span>} on {mask(fmtUsd(j.investedUsd))} of $WIF bought or received
            </p>
          </div>
          <a
            className="btn-ghost w-full shrink-0 sm:w-auto"
            href={`https://x.com/intent/post?text=${encodeURIComponent(share)}`}
            target="_blank"
            rel="noreferrer"
          >
            Post on X
          </a>
        </div>
        {badges.length > 0 && (
          <div className="relative mt-6 flex flex-wrap gap-2" data-testid="journey-badges">
            {badges.map((b) => (
              <span key={b.label} className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-sm" title={b.detail}>
                {b.emoji} {b.label}
                <span className="ml-2 text-xs text-dim">{b.detail}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {(!complete || j.partial || j.unpriced > 0) && (
        <p className="rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-3 text-xs text-[#ffe7a8]" data-testid="journey-note">
          {!complete || j.partial
            ? 'Part of your $WIF history could not be loaded, so these numbers use the transfers we could read. Your balance is always exact.'
            : `${j.unpriced} early ${j.unpriced === 1 ? 'transfer has' : 'transfers have'} no market price for that day and ${j.unpriced === 1 ? 'is' : 'are'} left out of the average.`}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.k} className="card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">{s.k}</p>
            <p className={cx('mt-1.5 font-display text-xl font-semibold', s.tone)}>{s.v}</p>
            {s.sub && <p className="mt-0.5 text-xs text-mute">{s.sub}</p>}
          </div>
        ))}
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-bold">Your $WIF moves</h2>
          <Link href="/app/wif/card" className="flex items-center gap-1.5 text-xs text-mute hover:text-white">
            <IdCard className="h-3.5 w-3.5" /> Make your holder card
          </Link>
        </div>
        <ul className="divide-y divide-white/[0.05]">
          {j.events.slice(0, 15).map((e, i) => (
            <li key={`${e.t}-${i}`} className="flex items-center gap-3 py-2.5 text-sm">
              <span className={cx('rounded-lg p-1.5', e.direction === 'in' ? 'bg-accent/10 text-accent' : 'bg-white/5 text-mute')}>
                {e.direction === 'in' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {e.direction === 'in' ? 'Added' : 'Sold or sent'} {mask(fmtWif(e.amount))} WIF
                </p>
                <p className="text-xs text-dim">
                  {date(e.t)} · {e.priceUsd !== null ? `at ${fmtUsd(e.priceUsd)}` : 'no market price that day'}
                </p>
              </div>
              {e.realizedUsd !== null && (
                <span className={cx('font-mono text-xs', e.realizedUsd >= 0 ? 'text-accent' : 'text-bad')}>{mask(`${e.realizedUsd >= 0 ? '+' : '−'}${fmtUsd(Math.abs(e.realizedUsd))}`)}</span>
              )}
            </li>
          ))}
        </ul>
        {j.events.length > 15 && <p className="mt-2 text-xs text-dim">Showing your 15 most recent of {j.events.length} $WIF moves.</p>}
      </section>
    </>
  )
}
