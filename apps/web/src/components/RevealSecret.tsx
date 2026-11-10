'use client'
import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react'
import { derivePrivateKey, type WalletSecret } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { Callout, ErrorBox, Modal, Spinner, cx } from './ui'

const HIDE_AFTER_MS = 60_000
const CLEAR_CLIPBOARD_MS = 30_000

/**
 * Show a wallet's recovery phrase or an account's private key.
 * The password is always re-checked (decrypting the vault), the secret is blurred until
 * the user taps reveal, it hides itself after a minute, and copies are wiped from the
 * clipboard after 30 seconds. Nothing leaves this device.
 */
export function RevealSecretModal({
  walletId,
  accountIndex = 0,
  open,
  onClose,
  initialTab,
}: {
  walletId: string
  accountIndex?: number
  open: boolean
  onClose: () => void
  initialTab?: 'phrase' | 'key'
}) {
  const { state, revealSecret } = useWallet()
  const wallet = state.wallets.find((w) => w.id === walletId)
  const account = wallet?.accounts.find((a) => a.index === accountIndex) ?? wallet?.accounts[0]
  const [pw, setPw] = useState('')
  const [alone, setAlone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [secret, setSecret] = useState<WalletSecret | null>(null)
  const [tab, setTab] = useState<'phrase' | 'key'>(initialTab ?? (wallet?.kind === 'mnemonic' ? 'phrase' : 'key'))
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)

  const close = () => {
    setPw('')
    setAlone(false)
    setErr(null)
    setSecret(null)
    setShown(false)
    setCopied(false)
    onClose()
  }

  // Hide again after a minute on screen.
  useEffect(() => {
    if (!secret) return
    const t = setTimeout(close, HIDE_AFTER_MS)
    return () => clearTimeout(t)
  }, [secret]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) setTab(initialTab ?? (wallet?.kind === 'mnemonic' ? 'phrase' : 'key'))
  }, [open, initialTab, wallet?.kind])

  if (!wallet) return null
  const isPhrase = secret?.kind === 'mnemonic'
  const privateKey = secret ? (secret.kind === 'mnemonic' ? derivePrivateKey(secret.phrase, account?.index ?? 0) : secret.privateKey) : ''
  const value = tab === 'phrase' && isPhrase ? secret.phrase : privateKey

  async function unlock() {
    setErr(null)
    setBusy(true)
    try {
      setSecret(await revealSecret(walletId, pw))
      setPw('')
    } catch {
      setErr('Wrong password.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {})
        setCopied(false)
      }, CLEAR_CLIPBOARD_MS)
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <Modal open={open} onClose={close} title={secret ? (tab === 'phrase' ? 'Your recovery phrase' : 'Your private key') : 'Show recovery phrase / private key'}>
      {!secret ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void unlock()
          }}
        >
          <Callout tone="danger" icon={<ShieldAlert className="h-4 w-4" />} title="Anyone who sees this can take everything">
            Your recovery phrase and private key give full control of your funds. InWIF and its team will never ask for them. Never type them into a website or send
            them to anyone.
          </Callout>
          <label className="flex items-start gap-2.5 text-sm text-mute">
            <input type="checkbox" className="mt-1 accent-[#E8622C]" checked={alone} onChange={(e) => setAlone(e.target.checked)} />
            Nobody can see my screen, and I am not sharing it or recording it.
          </label>
          <div>
            <label className="label" htmlFor="reveal-pw">
              <KeyRound className="mr-1 inline h-3 w-3" /> Wallet password
            </label>
            <input id="reveal-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </div>
          {err && <ErrorBox>{err}</ErrorBox>}
          <button className="btn-primary h-12 w-full" disabled={!alone || !pw || busy}>
            {busy ? <Spinner /> : <Eye className="h-4 w-4" />} Continue
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {isPhrase && (
            <div className="flex rounded-full bg-ink-900 p-1 text-sm" role="tablist">
              {(['phrase', 'key'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={cx('flex-1 rounded-full py-2 font-medium transition', tab === t ? 'bg-paper text-fg shadow-[0_1px_2px_rgba(17,17,17,.08)]' : 'text-mute')}
                  onClick={() => {
                    setTab(t)
                    setShown(false)
                  }}
                >
                  {t === 'phrase' ? 'Recovery phrase' : 'Private key'}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-dim">
            {tab === 'phrase'
              ? `Restores every account in "${wallet.name}" in InWIF or any standard wallet.`
              : `Controls only ${account?.label ?? 'this account'} (${account?.address.slice(0, 6)}…${account?.address.slice(-4)}).`}
          </p>
          <div className="relative">
            <div className={cx('rounded-2xl bg-ink-900 p-4 transition', !shown && 'select-none blur-md')} aria-hidden={!shown} data-testid="secret-value">
              {tab === 'phrase' && isPhrase ? (
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {secret.phrase.split(' ').map((w, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
                      <span className="w-5 text-right font-mono text-xs text-dim">{i + 1}</span>
                      <span className="font-medium">{w}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="break-all font-mono text-sm">{privateKey}</p>
              )}
            </div>
            {!shown && (
              <button className="btn-dark absolute inset-0 m-auto h-fit w-fit" onClick={() => setShown(true)}>
                <Eye className="h-4 w-4" /> Tap to reveal
              </button>
            )}
          </div>
          {shown && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setShown(false)}>
                <EyeOff className="h-4 w-4" /> Hide
              </button>
              <button className="btn-ghost" onClick={copy}>
                <Copy className="h-4 w-4" /> {copied ? 'Copied · clears in 30s' : 'Copy'}
              </button>
            </div>
          )}
          <Callout tone="warn">Write it down on paper and keep it somewhere safe and offline. This window closes itself after a minute.</Callout>
          <button className="btn-primary h-12 w-full" onClick={close}>
            Done
          </button>
        </div>
      )}
    </Modal>
  )
}

/** Settings section: buttons to show the active wallet's phrase / key. */
export function RecoveryCard() {
  const { activeWallet, activeAccount } = useWallet()
  const [open, setOpen] = useState<null | 'phrase' | 'key'>(null)
  if (!activeWallet) return null
  const hasKeys = activeWallet.kind === 'mnemonic' || activeWallet.kind === 'privateKey'
  return (
    <section className="card p-5" id="recovery">
      <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
        <KeyRound className="h-5 w-5 text-accent" /> Recovery phrase &amp; private key
      </h2>
      {hasKeys ? (
        <>
          <p className="mb-4 text-sm text-mute">View them any time with your wallet password. Keep them offline: anyone who has them controls your funds.</p>
          <div className="flex flex-wrap gap-2">
            {activeWallet.kind === 'mnemonic' && (
              <button className="btn-ghost" onClick={() => setOpen('phrase')}>
                <Eye className="h-4 w-4" /> Show recovery phrase
              </button>
            )}
            <button className="btn-ghost" onClick={() => setOpen('key')}>
              <Eye className="h-4 w-4" /> Show private key
            </button>
          </div>
          <RevealSecretModal walletId={activeWallet.id} accountIndex={activeAccount?.index} open={!!open} initialTab={open ?? undefined} onClose={() => setOpen(null)} />
        </>
      ) : (
        <p className="text-sm text-mute">
          {activeWallet.kind === 'watch' ? 'Watch-only wallets have no recovery phrase or private key.' : 'A hardware wallet keeps its keys on the device; they can never be shown here.'}
        </p>
      )}
    </section>
  )
}
