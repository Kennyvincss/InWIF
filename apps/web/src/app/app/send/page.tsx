'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { encodeFunctionData, erc20Abi, formatUnits, type Address } from 'viem'
import { ArrowUpRight, BadgeCheck } from 'lucide-react'
import { checkRecipient, findLookalike, looksLikeUsername, parseAmount, parsePaymentRequest, type Finding } from '@inwif/core'
import { useScamShield } from '@/lib/shield'
import { useWallet } from '@/lib/wallet-store'
import { useNetwork, usePortfolio, useTokens } from '@/lib/hooks'
import { fmtToken, fmtUsd, fmtValue } from '@/lib/format'
import { TxFlow, type TxRequest } from '@/components/TxFlow'
import { AddressAvatar, ErrorBox, Findings, Notice, PageHeader, PercentButtons, Spinner, TokenPicker } from '@/components/ui'
import { useNameLookup } from '@/lib/usernames'
import { percentOf, useGasReserve } from '@/lib/amount'

export default function SendPage() {
  return (
    <Suspense fallback={null}>
      <SendForm />
    </Suspense>
  )
}

function SendForm() {
  const { activeAccount, activeWallet, state, update } = useWallet()
  const { network } = useNetwork()
  const tokens = useTokens()
  const { rows } = usePortfolio(activeAccount?.address)
  // $WIF is preselected; networks without $WIF fall back to the native coin.
  const wifAddress = tokens.find((t) => t.isWif)?.address
  const [asset, setAsset] = useState<string>(wifAddress ?? 'native')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [req, setReq] = useState<TxRequest | null>(null)

  // Opened from a payment link (/pay → /app/send?to=…&token=…&amount=…): validate, then fill in.
  const search = useSearchParams()
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current && !search.get('to')) setAsset(wifAddress ?? 'native')
  }, [wifAddress]) // eslint-disable-line react-hooks/exhaustive-deps
  const [fromLink, setFromLink] = useState<{ note?: string; error?: string } | null>(null)
  const applied = useRef<string | null>(null)
  useEffect(() => {
    // Apply each link once, so later edits by the user are never overwritten.
    if (!search.get('to') || applied.current === `${network.key}?${search.toString()}`) return
    applied.current = `${network.key}?${search.toString()}`
    // A pay page link carries a username (to=@kenny); it is resolved and verified below like a typed one.
    const toParam = search.get('to') ?? ''
    const byUsername = looksLikeUsername(toParam)
    const p = parsePaymentRequest(
      { to: byUsername ? '0x000000000000000000000000000000000000dEaD' : toParam, token: search.get('token'), amount: search.get('amount'), note: search.get('note') },
      { tokens, nativeSymbol: network.nativeCurrency.symbol },
    )
    if (!p.ok) {
      setFromLink({ error: network.key !== 'robinhood' ? `This payment request is for Robinhood Chain. Switch network in the top bar.` : p.error })
      return
    }
    setTo(byUsername ? `@${toParam.replace(/^@/, '').toLowerCase()}` : p.request.to)
    setAsset(p.request.asset)
    if (p.request.amount) setAmount(p.request.amount)
    setFromLink({ note: p.request.note })
  }, [search, tokens, network])

  const row = rows.find((r) => r.key === asset)
  // A plain ETH transfer uses 21,000 gas; keep its fee back when filling from the ETH balance.
  const reserve = useGasReserve(21_000n)
  const available = row ? (asset === 'native' ? (reserve === undefined ? undefined : row.raw > reserve ? row.raw - reserve : 0n) : row.raw) : undefined
  const decimals = row?.decimals ?? 18
  // "@kenny" or "kenny" is a username: resolve it (signature verified on this device).
  const byName = !!to && looksLikeUsername(to)
  const name = useNameLookup(byName ? to : '')
  const claim = name.lookup?.status === 'taken' ? name.lookup.claim : null
  const pinned = claim ? state.namePins?.[claim.username] : undefined
  const nameFinding: Finding | null = !byName
    ? null
    : name.check && !name.check.ok
      ? { code: 'name-invalid', severity: 'danger', message: name.check.error }
      : name.error
        ? { code: 'name-error', severity: 'danger', message: name.error.message }
        : name.lookup && name.lookup.status !== 'taken'
          ? { code: 'name-missing', severity: 'danger', message: `No InWIF user is called @${name.name}. Check the spelling.` }
          : null
  // Scam shield: addresses this account really pays, from its own history (on this device).
  const shield = useScamShield(activeAccount?.address)
  const [lookalikeOk, setLookalikeOk] = useState(false)
  useEffect(() => setLookalikeOk(false), [to])
  const recipient = useMemo(() => {
    if (!to) return null
    if (byName && !claim) return nameFinding ? { ok: false, findings: [nameFinding] } : null
    const base = checkRecipient(claim ? claim.address : to, {
      self: activeAccount?.address,
      knownTokens: tokens.map((t) => t.address),
      blocklist: new Set(state.blocklist),
    })
    const r = withShield(base, activeAccount?.address)
    if (!claim) return r
    // A username's address is checksummed by its signed claim; drop the "no checksum" hint.
    const findings = r.findings.filter((f) => f.code !== 'no-checksum')
    if (pinned && pinned.toLowerCase() !== claim.address.toLowerCase()) {
      return {
        ok: false,
        address: r.address,
        findings: [{ code: 'name-changed', severity: 'danger' as const, message: `@${claim.username} now points to a different address than when you last paid them. Confirm with them directly and send to their 0x address.` }, ...findings],
      }
    }
    if (!pinned) findings.push({ code: 'name-new', severity: 'info', message: `First payment to @${claim.username}. Check the address with them if this is a large amount.` })
    return { ...r, findings }
  }, [to, byName, claim, pinned, nameFinding?.message, activeAccount, tokens, state.blocklist, shield.trusted, lookalikeOk]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Block look-alikes of addresses the user has paid; note known and new addresses. */
  function withShield(r: ReturnType<typeof checkRecipient>, self?: Address): ReturnType<typeof checkRecipient> {
    if (!r.address || !shield.ready || (self && r.address.toLowerCase() === self.toLowerCase())) return r
    const lower = r.address.toLowerCase()
    if (shield.trusted.has(lower)) {
      return { ...r, findings: [...r.findings.filter((f) => f.code !== 'no-checksum'), { code: 'sent-before', severity: 'info', message: '✓ You have paid this address before.' }] }
    }
    const imitates = findLookalike(r.address, shield.trusted)
    if (imitates) {
      return {
        ok: r.ok && lookalikeOk,
        address: r.address,
        findings: [
          {
            code: 'lookalike',
            severity: 'danger',
            message: `Scam warning: this address looks like ${imitates.slice(0, 6)}…${imitates.slice(-4)}, which you have paid before, but it is a different address (${r.address.slice(0, 6)}…${r.address.slice(-4)}). Scammers create look-alike addresses and plant them in your history. Did you copy it from your activity?`,
          },
          ...r.findings,
        ],
      }
    }
    return { ...r, findings: [...r.findings, { code: 'new-address', severity: 'info', message: 'New address: you have not paid it before. Check it with the recipient.' }] }
  }
  const lookalike = recipient?.findings.some((f) => f.code === 'lookalike')
  const imitated = lookalike && recipient?.address ? findLookalike(recipient.address, shield.trusted) : undefined
  const amt = amount ? parseAmount(amount, decimals, row?.raw) : null
  const usd = amt?.raw !== undefined && row?.priceUsd ? Number(formatUnits(amt.raw, decimals)) * row.priceUsd : null
  const ready = recipient?.ok && amt?.ok && activeWallet?.kind !== 'watch'

  const pin = useRef<{ username: string; address: Address } | null>(null)
  function review() {
    if (!recipient?.address || !amt?.raw || !row) return
    pin.current = claim ? { username: claim.username, address: claim.address } : null
    const summary = `Send ${amount} ${row.symbol}${claim ? ` to @${claim.username}` : ''}`
    const named = pin.current ?? undefined
    if (asset === 'native') setReq({ to: recipient.address, value: amt.raw, summary, kind: 'send', recipient: named })
    else
      setReq({
        to: asset as Address,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient.address, amt.raw] }),
        summary,
        kind: 'send',
        recipient: named,
      })
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Send" subtitle={`On ${network.name}. You will review every detail and the network fee before signing.`} />
      {fromLink?.error && <div className="mb-4"><ErrorBox>{fromLink.error}</ErrorBox></div>}
      {fromLink && !fromLink.error && (
        <div className="mb-4">
          <Notice tone="lime">
            Filled in from a payment request{fromLink.note ? <> — &ldquo;{fromLink.note}&rdquo;</> : ''}. Check the recipient before you send.
          </Notice>
        </div>
      )}
      <div className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="asset">Asset</label>
          <TokenPicker
            label="Asset"
            value={asset}
            onChange={(k) => {
              touched.current = true
              setAsset(k)
              setAmount('')
            }}
            options={rows.map((r) => ({ key: r.key, symbol: r.symbol, detail: fmtToken(r.raw, r.decimals) }))}
          />
          {row && <p className="mt-1 text-xs text-mute">Balance {fmtToken(row.raw, row.decimals)} {row.symbol}</p>}
        </div>
        <div>
          <label className="label" htmlFor="to">Recipient</label>
          <input id="to" className="input font-mono" placeholder="@username or 0x address" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="none" aria-label="Recipient address" />
          {byName && name.pending && (
            <p className="mt-2 flex items-center gap-2 text-xs text-mute"><Spinner /> Looking up @{name.name}…</p>
          )}
          {claim && (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.05] p-3" data-testid="resolved-username">
              <AddressAvatar address={claim.address} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  @{claim.username} <BadgeCheck className="h-4 w-4 text-accent" aria-label="Verified username" />
                </p>
                <p className="break-all font-mono text-[11px] text-mute">{claim.address}</p>
              </div>
            </div>
          )}
          {recipient && (
            <div className="mt-2">
              <Findings findings={recipient.findings} />
            </div>
          )}
          {lookalike && imitated && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setTo(imitated)}>
                Use {imitated.slice(0, 6)}…{imitated.slice(-4)} instead (the one you paid)
              </button>
              <label className="flex items-center gap-2 text-xs text-mute">
                <input type="checkbox" className="accent-[#FF4D6A]" checked={lookalikeOk} onChange={(e) => setLookalikeOk(e.target.checked)} />
                I checked with the recipient. This new address is correct.
              </label>
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0" htmlFor="amt">Amount</label>
            <PercentButtons disabled={!row || available === undefined || available === 0n} onPick={(p) => row && available !== undefined && setAmount(percentOf(available, row.decimals, p, asset !== 'native'))} />
          </div>
          <input id="amt" className="input text-lg" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="mt-1 flex justify-between text-xs text-mute">
            <span>{usd !== null ? `≈ ${row?.token?.isWif ? fmtUsd(usd) : fmtValue(usd, state.settings.displayCurrency ?? 'WIF', rows.find((r) => r.token?.isWif)?.priceUsd)}` : ' '}</span>
            {amt && !amt.ok && <span className="text-bad">{amt.error}</span>}
          </div>
          {asset === 'native' && <p className="mt-1 text-xs text-mute">100% keeps a little ETH back for the network fee. The review shows the exact fee.</p>}
        </div>
        {activeWallet?.kind === 'watch' && <ErrorBox>Watch-only wallets cannot send.</ErrorBox>}
        <Notice>Sending is free in InWIF. You only pay the {network.name} network fee, shown before you confirm.</Notice>
        <button className="btn-primary w-full" disabled={!ready} onClick={review}>
          <ArrowUpRight className="h-4 w-4" /> Review transaction
        </button>
      </div>
      <TxFlow
        request={req}
        onClose={() => setReq(null)}
        onDone={(_, ok) => {
          if (ok) {
            // Remember who @name was, so a later change of address is caught before sending.
            const p = pin.current
            if (p) update((s) => ({ ...s, namePins: { ...s.namePins, [p.username]: p.address } }))
            setAmount('')
            setTo('')
          }
        }}
      />
    </div>
  )
}
