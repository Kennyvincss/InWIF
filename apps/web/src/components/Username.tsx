'use client'
import { useEffect, useId, useState } from 'react'
import { AtSign, CheckCircle2, XCircle } from 'lucide-react'
import type { Address } from 'viem'
import { USERNAME_MAX, type UsernameClaim } from '@inwif/core'
import { claimUsername, useNameLookup, useSetUsername, useUsername } from '@/lib/usernames'
import { CopyButton, ErrorBox, FieldHint, Spinner, cx } from './ui'
import { useWallet } from '@/lib/wallet-store'

/** Pick and claim a username for `address`. Signing is free and sends no transaction. */
export function UsernameClaimForm({
  address,
  sign,
  onDone,
  submitLabel = 'Claim username',
  autoFocus,
  unlock,
}: {
  address: Address
  sign?: (message: string) => Promise<`0x${string}`>
  /** Offered when the wallet is locked: unlock it here with the wallet password. */
  unlock?: (password: string) => Promise<void>
  onDone?: (claim: UsernameClaim) => void
  submitLabel?: string
  autoFocus?: boolean
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const inputId = useId()
  const setUsername = useSetUsername()
  const { name, check, pending, lookup, error } = useNameLookup(input)

  async function doUnlock() {
    if (!unlock || !pw) return
    setErr(null)
    setUnlocking(true)
    try {
      await unlock(pw)
      setPw('')
    } catch {
      setErr('Wrong password.')
    } finally {
      setUnlocking(false)
    }
  }

  const mine = (owner?: string) => !!owner && owner.toLowerCase() === address.toLowerCase()
  let status: { tone: 'ok' | 'bad' | 'mute'; text: string } | null = null
  if (input && check && !check.ok) status = { tone: 'bad', text: check.error }
  else if (pending) status = { tone: 'mute', text: 'Checking…' }
  else if (error) status = { tone: 'bad', text: error.message }
  else if (lookup?.status === 'available') status = { tone: 'ok', text: `@${name} is available` }
  else if (lookup?.status === 'taken') status = mine(lookup.claim.address) ? { tone: 'ok', text: `@${name} is already yours` } : { tone: 'bad', text: `@${name} is taken` }
  else if (lookup?.status === 'similar') status = mine(lookup.owner) ? { tone: 'ok', text: `@${name} is available` } : { tone: 'bad', text: 'Too close to a username that is taken' }
  else if (lookup?.status === 'invalid') status = { tone: 'bad', text: lookup.error }

  const canClaim = !!sign && status?.tone === 'ok' && !busy

  async function submit() {
    if (!sign || !canClaim) return
    setErr(null)
    setBusy(true)
    try {
      const claim = await claimUsername(name, address, sign)
      setUsername(claim)
      onDone?.(claim)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="label" htmlFor={inputId}>Username</label>
      <div className="relative">
        <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
        <input
          id={inputId}
          className="input pl-10 text-[15px]"
          placeholder="yourname"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\s/g, '').toLowerCase())}
          maxLength={USERNAME_MAX + 1}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
        />
      </div>
      <p className={cx('mt-1.5 flex min-h-[18px] items-center gap-1.5 text-xs', status?.tone === 'ok' ? 'text-accent' : status?.tone === 'bad' ? 'text-bad' : 'text-mute')} aria-live="polite">
        {status?.tone === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}
        {status?.tone === 'bad' && <XCircle className="h-3.5 w-3.5" />}
        {status?.text ?? '3–20 letters, numbers or _'}
      </p>
      {err && <div className="mt-2"><ErrorBox>{err}</ErrorBox></div>}
      {!sign && !unlock && <FieldHint tone="warn" className="mt-2">Unlock this wallet to claim a username.</FieldHint>}
      {!sign && unlock && (
        <div className="mt-3">
          <label className="label" htmlFor={`${inputId}-pw`}>Wallet password</label>
          <div className="flex gap-2">
            <input
              id={`${inputId}-pw`}
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void doUnlock()
                }
              }}
              autoComplete="current-password"
            />
            <button type="button" className="btn-ghost shrink-0" disabled={!pw || unlocking} onClick={() => void doUnlock()}>
              {unlocking ? <Spinner /> : 'Unlock'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-dim">Your wallet is locked. Enter its password to sign the change (free, no transaction).</p>
        </div>
      )}
      <button className="btn-primary mt-4 w-full" disabled={!canClaim}>
        {busy ? <Spinner /> : <AtSign className="h-4 w-4" />} {busy ? 'Saving…' : name && status?.tone === 'ok' ? `Claim @${name}` : submitLabel}
      </button>
    </form>
  )
}

/** "@name" for an address, or nothing when it has none. */
export function UsernameText({ address, className }: { address?: Address; className?: string }) {
  const u = useUsername(address)
  if (!u.data) return null
  return <span className={className}>@{u.data.username}</span>
}

/** The active account's username, or a way to claim one (Settings and Receive). */
export function MyUsernameCard({ compact }: { compact?: boolean }) {
  const { activeWallet, activeAccount, isUnlocked, unlock, softwareSignerFor } = useWallet()
  const address = activeAccount?.address
  const u = useUsername(address)
  const [changing, setChanging] = useState(false)
  const [changedFrom, setChangedFrom] = useState<string | null>(null)
  if (!activeWallet || !address) return null
  const canSign = (activeWallet.kind === 'mnemonic' || activeWallet.kind === 'privateKey') && isUnlocked(activeWallet.id)
  const sign = canSign ? (m: string) => softwareSignerFor(activeWallet.id, activeAccount.index).signMessage!(m) : undefined
  const software = activeWallet.kind === 'mnemonic' || activeWallet.kind === 'privateKey'
  const unlockHere = software && !canSign ? (pw: string) => unlock(activeWallet.id, pw) : undefined

  return (
    <section className="card p-5" id="username">
      <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
        <AtSign className="h-5 w-5 text-accent" /> Username
      </h2>
      {u.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-mute"><Spinner /> Loading…</p>
      ) : u.data ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="font-display text-2xl font-semibold text-accent" data-testid="my-username">@{u.data.username}</p>
          <CopyButton value={`@${u.data.username}`} label="Copy" />
          <p className="w-full text-sm text-mute">Anyone on InWIF can send to @{u.data.username}. It always points to this account&apos;s address.</p>
          {changedFrom && (
            <p className="w-full text-sm text-ok" data-testid="username-changed">
              Changed from @{changedFrom}. Your old name still points to you, so old links keep working and nobody else can take it.
            </p>
          )}
          <PayPageLink username={u.data.username} />
          {!compact && (activeWallet.kind === 'mnemonic' || activeWallet.kind === 'privateKey') && (
            <div className="w-full">
              {!changing ? (
                <button className="btn-ghost" onClick={() => setChanging(true)}>
                  <AtSign className="h-4 w-4" /> Change username
                </button>
              ) : (
                <div className="rounded-2xl bg-ink-900 p-4">
                  <p className="mb-3 text-sm text-mute">
                    Pick a new username. @{u.data.username} stays yours and keeps working, so nobody can take it over. You can have up to 5 names.
                  </p>
                  <UsernameClaimForm
                    address={address}
                    sign={sign}
                    unlock={unlockHere}
                    submitLabel="Change username"
                    autoFocus
                    onDone={(c) => {
                      setChangedFrom(u.data?.username ?? null)
                      setChanging(false)
                      void c
                    }}
                  />
                  <button className="mt-2 w-full text-center text-xs text-mute hover:text-fg" onClick={() => setChanging(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : activeWallet.kind === 'watch' ? (
        <p className="text-sm text-mute">Watch-only wallets can&apos;t claim a username.</p>
      ) : activeWallet.kind === 'hardware' ? (
        <p className="text-sm text-mute">Usernames for hardware wallets are coming soon.</p>
      ) : (
        <>
          {!compact && <p className="mb-4 text-sm text-mute">Let friends send to @username instead of your long address. Free, no transaction.</p>}
          <UsernameClaimForm address={address} sign={sign} unlock={unlockHere} />
        </>
      )}
    </section>
  )
}

/** The user's public pay page link, with copy, open and post-on-X. */
function PayPageLink({ username }: { username: string }) {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  if (!origin) return null
  const link = `${origin}/@${username}`
  return (
    <div className="w-full rounded-xl border border-fg/[0.08] bg-ink-900 p-3">
      <p className="text-[11.5px]  text-dim font-medium">Your pay page</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <a href={`/@${username}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-sm text-fg hover:text-accent" data-testid="pay-page-link">
          {link.replace(/^https?:\/\//, '')}
        </a>
        <CopyButton value={link} label="Copy link" />
        <a className="btn-ghost px-3 py-1.5 text-xs" href={`https://x.com/intent/post?text=${encodeURIComponent(`Pay me in $WIF: ${link}`)}`} target="_blank" rel="noreferrer">
          Post on X
        </a>
      </div>
      <p className="mt-1.5 text-xs text-dim">Put it in your bio. Anyone can open it and pay you in $WIF.</p>
    </div>
  )
}
