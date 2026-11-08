'use client'
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { HandCoins, Share2 } from 'lucide-react'
import { PAYMENT_NOTE_MAX, buildPaymentLink, parsePaymentRequest, type TokenInfo } from '@inwif/core'
import type { Address } from 'viem'
import { CopyButton, TokenPicker } from './ui'

/** "Pay me 5,000 WIF": builds a shareable link + QR that opens InWIF with everything filled in. */
export function PaymentRequestCreator({ to, tokens, nativeSymbol }: { to: Address; tokens: TokenInfo[]; nativeSymbol: string }) {
  const wif = tokens.find((t) => t.isWif)
  const [token, setToken] = useState(wif?.symbol ?? nativeSymbol)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [qr, setQr] = useState('')
  const parsed = useMemo(() => parsePaymentRequest({ to, token, amount, note }, { tokens, nativeSymbol }), [to, token, amount, note, tokens, nativeSymbol])
  const link = parsed.ok && typeof window !== 'undefined' ? buildPaymentLink(window.location.origin, { to, symbol: parsed.request.symbol, amount: parsed.request.amount, note }) : ''

  useEffect(() => {
    if (!link) return setQr('')
    QRCode.toDataURL(link, { margin: 1, width: 520, color: { dark: '#000000', light: '#FFFFFF' } }).then(setQr)
  }, [link])

  const options = [{ key: nativeSymbol, symbol: nativeSymbol }, ...tokens.map((t) => ({ key: t.symbol, symbol: t.symbol }))]
  const title = parsed.ok ? `Pay me ${parsed.request.amount ? `${parsed.request.amount} ` : ''}${parsed.request.symbol}` : 'Payment request'

  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <HandCoins className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-medium">Request a payment</h2>
          <p className="text-sm text-mute">Create a link or QR code. Whoever opens it gets everything filled in — they just confirm.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr,200px]">
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr,9rem] gap-2">
            <div>
              <label className="label" htmlFor="req-amount">Amount (optional)</label>
              <input id="req-amount" className="input" inputMode="decimal" placeholder="Any amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/,/g, ''))} />
            </div>
            <div>
              <p className="label">Token</p>
              <TokenPicker label="Request token" value={token} onChange={setToken} options={options} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="req-note">Note (optional)</label>
            <input id="req-note" className="input" maxLength={PAYMENT_NOTE_MAX} placeholder="e.g. Dinner on Friday" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {!parsed.ok && amount && <p className="text-xs text-bad">{parsed.error}</p>}
          {link && (
            <div className="space-y-2">
              <p className="label">Your payment link</p>
              <p className="break-all rounded-xl border border-white/[0.08] bg-black/60 p-3 font-mono text-xs text-mute">{link}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={link} label="Copy link" />
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => navigator.share({ title, text: `${title} with InWIF`, url: link }).catch(() => {})}>
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-white p-3 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt="QR code for the payment link" className="h-auto w-full" /> : <div className="aspect-square" />}
        </div>
      </div>
    </section>
  )
}
