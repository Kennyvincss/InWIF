'use client'
import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { DEFAULT_TOKENS, ROBINHOOD_MAINNET, parsePaymentRequest } from '@inwif/core'
import { SitePage } from '@/components/site/Site'
import { AddressAvatar, CopyButton, ErrorBox, TokenIcon } from '@/components/ui'

function PayRequest() {
  const q = useSearchParams()
  const parsed = parsePaymentRequest(
    { to: q.get('to'), token: q.get('token'), amount: q.get('amount'), note: q.get('note') },
    { tokens: DEFAULT_TOKENS.robinhood, nativeSymbol: ROBINHOOD_MAINNET.nativeCurrency.symbol },
  )
  if (!parsed.ok)
    return (
      <div className="card p-8">
        <p className="eyebrow">Payment request</p>
        <h1 className="mt-4 font-display text-3xl font-semibold">This link doesn&apos;t work</h1>
        <div className="mt-5">
          <ErrorBox>{parsed.error}</ErrorBox>
        </div>
        <p className="mt-4 text-sm text-mute">Ask the person who sent it for a new link. Never send funds to an address you can&apos;t confirm.</p>
      </div>
    )
  const r = parsed.request
  const params = new URLSearchParams({ to: r.to, token: r.symbol, ...(r.amount ? { amount: r.amount } : {}), ...(r.note ? { note: r.note } : {}) })
  return (
    <div className="card relative overflow-hidden p-8 text-center">
      <p className="eyebrow relative justify-center">
        <span className="live-dot" /> Payment request · {ROBINHOOD_MAINNET.name}
      </p>
      <div className="relative mx-auto mt-8 w-fit">
        <TokenIcon symbol={r.symbol} size={72} />
      </div>
      <h1 className="relative mt-6 font-display text-[44px] font-semibold leading-none sm:text-[56px]">
        {r.amount ? Number(r.amount).toLocaleString('en-US', { maximumFractionDigits: 18 }) : 'Any amount'} <span className="text-gradient">{r.symbol}</span>
      </h1>
      {r.note && <p className="relative mx-auto mt-4 max-w-sm text-lg text-white/90">&ldquo;{r.note}&rdquo;</p>}
      <div className="relative mx-auto mt-8 flex max-w-md items-center gap-3 rounded-2xl border border-white/[0.08] bg-ink-900 p-3 text-left">
        <AddressAvatar address={r.to} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] uppercase tracking-[0.04em] text-[#9095A4] font-medium">Pay to</p>
          <p className="break-all font-mono text-xs text-mute">{r.to}</p>
        </div>
        <CopyButton value={r.to} />
      </div>
      <div className="relative mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/app/send?${params}`} className="btn-primary px-6 py-3 text-[15px]">
          Pay with InWIF <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="relative mx-auto mt-6 flex max-w-md items-start gap-2 text-left text-xs text-dim">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Only pay people you know, and check the address with them if you can. You will review everything again before anything is sent. New to InWIF? You&apos;ll create a free wallet first.
      </p>
    </div>
  )
}

export default function PayPage() {
  return (
    <SitePage>
      <section className="mx-auto max-w-xl px-5 py-16 sm:py-24">
        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <PayRequest />
        </Suspense>
      </section>
    </SitePage>
  )
}
