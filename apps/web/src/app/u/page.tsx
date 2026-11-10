'use client'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { ArrowRight, BadgeCheck, Share2, ShieldAlert, UserX } from 'lucide-react'
import { normaliseUsername } from '@inwif/core'
import { SitePage } from '@/components/site/Site'
import { AddressAvatar, CopyButton, ErrorBox, Spinner, TokenIcon } from '@/components/ui'
import { lookupName } from '@/lib/usernames'

/** Public pay page for an InWIF username: inwif.app/@name (rewritten to /u?name=name). */
function Profile() {
  const q = useSearchParams()
  const path = usePathname() ?? ''
  // Opened as /@kenny (rewritten on the server; the browser keeps the pretty path) or /u?name=kenny.
  const fromPath = decodeURIComponent(path).match(/^\/@([^/]+)\/?$/)?.[1]
  const raw = (fromPath ?? q.get('name') ?? '').replace(/^@/, '')
  const n = normaliseUsername(raw)
  const name = n.ok ? n.username : ''
  const look = useQuery({ queryKey: ['name', name], queryFn: () => lookupName(name), enabled: !!name, retry: 1 })
  const [qr, setQr] = useState('')
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const link = origin && name ? `${origin}/@${name}` : ''
  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 440, color: { dark: '#000000', light: '#FFFFFF' } }).then(setQr)
  }, [link])

  if (!n.ok)
    return (
      <div className="card p-8">
        <h1 className="font-display text-3xl font-semibold">This link doesn&apos;t work</h1>
        <p className="mt-3 text-sm text-mute">That isn&apos;t a valid InWIF username.</p>
      </div>
    )
  if (look.isLoading)
    return (
      <div className="card flex items-center justify-center gap-3 p-16 text-mute">
        <Spinner /> Looking up @{name}…
      </div>
    )
  if (look.isError) return <ErrorBox>{(look.error as Error).message}</ErrorBox>
  const claim = look.data?.status === 'taken' ? look.data.claim : null
  if (!claim)
    return (
      <div className="card p-8 text-center">
        <UserX className="mx-auto h-10 w-10 text-dim" />
        <h1 className="mt-5 font-display text-3xl font-semibold">@{name} isn&apos;t on InWIF yet</h1>
        <p className="mt-3 text-sm text-mute">
          {look.data?.status === 'available' ? 'This username is free. It could be yours.' : 'No InWIF user has this username.'}
        </p>
        {look.data?.status === 'available' && (
          <Link href="/app" className="btn-primary mx-auto mt-6 w-fit">
            Create a free wallet and claim it <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    )

  const tweet = `Pay me in $WIF: @${claim.username} on InWIF ${link}`
  return (
    <div className="card relative overflow-hidden p-8 text-center" data-testid="pay-profile">
      <div className="relative mx-auto w-fit">
        <AddressAvatar address={claim.address} size={84} />
        <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-black">
          <TokenIcon symbol="WIF" size={30} />
        </span>
      </div>
      <h1 className="relative mt-6 flex items-center justify-center gap-2 font-display text-[40px] font-semibold leading-none sm:text-[48px]">
        @{claim.username} <BadgeCheck className="h-7 w-7 text-accent" aria-label="Verified username" />
      </h1>
      <p className="relative mt-3 text-mute">Send me $WIF on Robinhood Chain.</p>

      <div className="relative mx-auto mt-7 flex max-w-md items-center gap-3 rounded-2xl border border-white/[0.08] bg-ink-900 p-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] uppercase tracking-[0.04em] text-[#9095A4] font-medium">Wallet address</p>
          <p className="break-all font-mono text-xs text-mute">{claim.address}</p>
        </div>
        <CopyButton value={claim.address} />
      </div>

      <div className="relative mt-7 flex flex-wrap justify-center gap-3">
        <Link href={`/app/send?to=@${claim.username}&token=WIF`} className="btn-primary px-6 py-3 text-[15px]">
          Pay @{claim.username} in $WIF <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {qr && (
        <div className="relative mx-auto mt-8 w-44 rounded-2xl bg-white p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR code for @${claim.username}'s pay page`} className="h-auto w-full" />
        </div>
      )}
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        {link && <CopyButton value={link} label="Copy link" />}
        <a className="btn-ghost px-3 py-1.5 text-xs" href={`https://x.com/intent/post?text=${encodeURIComponent(tweet)}`} target="_blank" rel="noreferrer">
          Post on X
        </a>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => navigator.share({ title: `Pay @${claim.username} in $WIF`, url: link })}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
        )}
      </div>

      <p className="relative mx-auto mt-7 flex max-w-md items-start gap-2 text-left text-xs text-dim">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Verified: this address signed for @{claim.username}, and InWIF checks that signature on your device. Only pay people you know. New to InWIF? You&apos;ll create a free wallet first.
      </p>
    </div>
  )
}

export default function UserPage() {
  return (
    <SitePage>
      <section className="mx-auto max-w-xl px-5 py-16 sm:py-24">
        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <Profile />
        </Suspense>
      </section>
    </SitePage>
  )
}
