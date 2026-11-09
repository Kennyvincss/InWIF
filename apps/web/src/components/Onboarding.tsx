'use client'
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AtSign, Cpu, KeyRound, Plus, ScanEye, ShieldCheck } from 'lucide-react'
import type { Address } from 'viem'
import {
  accountFromMnemonic,
  checkMnemonic,
  checkPassword,
  checkRecipient,
  createMnemonic,
  normaliseMnemonic,
  normalisePrivateKey,
} from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { LogoMark } from './Logo'
import { BackupModal } from './BackupModal'
import { HARDWARE_ENABLED } from '@/lib/features'
import { ErrorBox, FieldHint, Notice, Spinner, cx } from './ui'
import { UsernameClaimForm } from './Username'
import { useUsername } from '@/lib/usernames'

type Step = 'welcome' | 'import' | 'watch' | 'password' | 'username' | 'done'

export function Onboarding({ embedded = false, onFinished }: { embedded?: boolean; onFinished?: () => void }) {
  const wallet = useWallet()
  const [step, setStep] = useState<Step>('welcome')
  const [strength, setStrength] = useState<128 | 256>(128)
  const [phrase, setPhrase] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [importMode, setImportMode] = useState<'phrase' | 'key'>('phrase')
  const [importInput, setImportInput] = useState('')
  const [watchInput, setWatchInput] = useState('')
  const [name, setName] = useState('Main wallet')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [source, setSource] = useState<'create' | 'phrase' | 'key'>('create')
  const [newWallet, setNewWallet] = useState<{ id: string; address: Address } | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)
  const existingName = useUsername(step === 'username' ? newWallet?.address : undefined)

  const pwCheck = checkPassword(pw)
  const importCheck = importMode === 'phrase' ? checkMnemonic(importInput) : null
  const importKey = importMode === 'key' ? normalisePrivateKey(importInput) : null

  // One step: the phrase is generated now and backed up later from the reminder.
  function startCreate() {
    setPhrase(createMnemonic(strength))
    setSource('create')
    setStep('password')
  }

  async function finish() {
    setErr(null)
    if (!pwCheck.ok) return setErr(pwCheck.problems.join(' '))
    if (pw !== pw2) return setErr('Passwords do not match.')
    setBusy(true)
    try {
      let w
      if (source === 'key') w = await wallet.importPrivateKey({ name, privateKey: importKey!, password: pw })
      else {
        // A created phrase is not backed up yet; an imported one already exists on paper.
        w = await wallet.createFromMnemonic({ name, phrase: source === 'create' ? phrase : normaliseMnemonic(importInput), password: pw, backedUp: source !== 'create' })
        setCreatedId(source === 'create' ? w.id : null)
      }
      setNewWallet({ id: w.id, address: w.accounts[0].address })
      // Clear secrets from component state as soon as they are encrypted.
      setPhrase('')
      setImportInput('')
      setPw('')
      setPw2('')
      setStep('username')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const card = 'card w-full max-w-xl bg-[#08080A]/90 p-6 sm:p-9'

  return (
    <div className={cx('flex items-center justify-center gap-16', !embedded && 'min-h-[80vh]')}>
      {!embedded && step === 'welcome' && (
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="hidden max-w-md lg:block">
          <p className="eyebrow">
            <span className="live-dot" /> Free forever · 0% fees
          </p>
          <h2 className="mt-6 font-display text-[52px] font-semibold leading-[1.02]">
            <span className="text-fade">Self-custody,</span>
            <br />
            <span className="text-gradient">made simple.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-mute">
            {['Your keys never leave this device', 'No email or personal details', 'Send, receive and swap with 0% InWIF fees'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
      <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={card}>
        {step === 'welcome' && (
          <div>
            <LogoMark size={44} />
            <h1 className="mt-6 font-display text-[30px] font-semibold leading-tight">Welcome to InWIF</h1>
            <p className="mt-2 text-mute">Your assets. Your keys. Your control. Everything is created and encrypted on this device.</p>
            <div className="mt-7 grid gap-3">
              <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 shadow-[0_0_40px_-20px_rgba(0,229,155,.6)]">
                <div className="flex items-center gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                    <Plus className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">Create a new wallet</p>
                    <p className="text-xs text-mute">Ready in seconds. Your recovery phrase is created on this device.</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex rounded-full border border-white/[0.08] bg-black/40 p-0.5 font-mono text-[11px]">
                    {([128, 256] as const).map((s) => (
                      <button key={s} className={cx('rounded-full px-3 py-1 transition', strength === s ? 'bg-white text-black' : 'text-mute hover:text-white')} onClick={() => setStrength(s)}>
                        {s === 128 ? '12 words' : '24 words'}
                      </button>
                    ))}
                  </div>
                  <button className="btn-primary ml-auto" onClick={startCreate}>
                    Create wallet
                  </button>
                </div>
              </div>
              <button className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 text-left transition hover:border-white/[0.16] hover:bg-white/[0.035]" onClick={() => setStep('import')}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-accent transition group-hover:border-accent/40 group-hover:shadow-glow-soft">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">Import an existing wallet</p>
                  <p className="text-xs text-mute">Use your recovery phrase or private key.</p>
                </div>
              </button>
              {HARDWARE_ENABLED ? (
                <Link href="/app/hardware" className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 text-left transition hover:border-white/[0.16] hover:bg-white/[0.035]" onClick={onFinished}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-accent transition group-hover:border-accent/40 group-hover:shadow-glow-soft">
                    <Cpu className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">Connect a hardware wallet</p>
                    <p className="text-xs text-mute">InWIF device (USB-C) or the built-in device simulator.</p>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] p-4 opacity-60" aria-disabled="true">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-mute">
                    <Cpu className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">Connect a hardware wallet</p>
                    <p className="text-xs text-mute">InWIF One hardware wallet.</p>
                  </div>
                  <span className="chip">Coming soon</span>
                </div>
              )}
              <button className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 text-left transition hover:border-white/[0.16] hover:bg-white/[0.035]" onClick={() => setStep('watch')}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-accent transition group-hover:border-accent/40 group-hover:shadow-glow-soft">
                  <ScanEye className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">Watch an address</p>
                  <p className="text-xs text-mute">Follow any address. View only — it can&apos;t send.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 'import' && (
          <div>
            <h2 className="font-display text-2xl font-bold">Import wallet</h2>
            <div className="mt-4 flex rounded-xl border border-white/10 p-1 text-sm">
              {(['phrase', 'key'] as const).map((m) => (
                <button key={m} className={cx('flex-1 rounded-lg py-1.5', importMode === m ? 'bg-white/10' : 'text-mute')} onClick={() => setImportMode(m)}>
                  {m === 'phrase' ? 'Recovery phrase' : 'Private key'}
                </button>
              ))}
            </div>
            <textarea
              className="input mt-4 h-28 font-mono"
              spellCheck={false}
              autoComplete="off"
              placeholder={importMode === 'phrase' ? 'word1 word2 word3 …' : '0x…64 hex characters'}
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              aria-label={importMode === 'phrase' ? 'Recovery phrase' : 'Private key'}
            />
            <div className="mt-2 text-xs">
              {importMode === 'phrase' && importInput && (
                importCheck?.ok ? (
                  <FieldHint tone="ok">
                    Valid {importCheck.wordCount}-word phrase · first address <span className="mono-chip">{accountFromMnemonic(importInput, 0).address}</span>
                  </FieldHint>
                ) : (
                  <FieldHint tone="danger">
                    {importCheck?.error}
                    {importCheck?.unknownWords.length ? ` Unknown: ${importCheck.unknownWords.slice(0, 5).join(', ')}` : ''}
                  </FieldHint>
                )
              )}
              {importMode === 'key' && importInput && (importKey ? <FieldHint tone="ok">Valid private key.</FieldHint> : <FieldHint tone="danger">Not a valid private key.</FieldHint>)}
            </div>
            <Notice>Validation happens on this device. Nothing you type here is transmitted or logged.</Notice>
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost" onClick={() => setStep('welcome')}>
                Back
              </button>
              <button
                className="btn-primary flex-1"
                disabled={importMode === 'phrase' ? !importCheck?.ok : !importKey}
                onClick={() => {
                  setSource(importMode === 'phrase' ? 'phrase' : 'key')
                  setName(importMode === 'phrase' ? 'Imported wallet' : 'Imported key')
                  setStep('password')
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'watch' && (
          <div>
            <h2 className="font-display text-2xl font-bold">Watch an address</h2>
            <input className="input mt-4 font-mono" placeholder="0x…" value={watchInput} onChange={(e) => setWatchInput(e.target.value)} aria-label="Address to watch" />
            {watchInput && !checkRecipient(watchInput).ok && <FieldHint tone="danger" className="mt-2">{checkRecipient(watchInput).findings[0]?.message}</FieldHint>}
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost" onClick={() => setStep('welcome')}>
                Back
              </button>
              <button
                className="btn-primary flex-1"
                disabled={!checkRecipient(watchInput).ok}
                onClick={() => {
                  wallet.addWatchWallet({ name: 'Watched address', address: checkRecipient(watchInput).address! })
                  setStep('done')
                }}
              >
                Add watch-only wallet
              </button>
            </div>
          </div>
        )}

        {step === 'password' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void finish()
            }}
          >
            <h2 className="font-display text-2xl font-bold">{source === 'create' ? 'Create your wallet' : 'Protect this wallet'}</h2>
            <p className="mt-1 text-sm text-mute">
              Choose a password to unlock InWIF on this device. Your keys are encrypted with it (AES-256-GCM, PBKDF2 600,000 iterations) and never leave your device.
            </p>
            <div className="mt-5 space-y-3">
              <div>
                <label className="label" htmlFor="wname">Wallet name</label>
                <input id="wname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </div>
              <div>
                <label className="label" htmlFor="pw1">Password</label>
                <input id="pw1" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                {pw && !pwCheck.ok && <FieldHint tone="warn" className="mt-1.5">{pwCheck.problems.join(' ')}</FieldHint>}
              </div>
              <div>
                <label className="label" htmlFor="pw2">Confirm password</label>
                <input id="pw2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
            <button className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? <Spinner /> : <ShieldCheck className="h-4 w-4" />} {source === 'create' ? 'Create wallet' : 'Encrypt & finish'}
            </button>
          </form>
        )}

        {step === 'username' && newWallet && (
          <div>
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <AtSign className="h-5 w-5" />
            </span>
            {existingName.data ? (
              <>
                <h2 className="mt-5 font-display text-2xl font-bold">Welcome back, @{existingName.data.username}</h2>
                <p className="mt-1 text-sm text-mute">This wallet already has a username. Friends can send to @{existingName.data.username}.</p>
                <button className="btn-primary mt-6 w-full" onClick={() => setStep('done')}>
                  Continue
                </button>
              </>
            ) : (
              <>
                <h2 className="mt-5 font-display text-2xl font-bold">Pick your username</h2>
                <p className="mt-1 text-sm text-mute">
                  Friends can send you $WIF at <span className="text-white">@username</span> instead of a long 0x address. It&apos;s free: you sign a message, no transaction.
                </p>
                <div className="mt-5">
                  {existingName.isLoading ? (
                    <p className="flex items-center gap-2 text-sm text-mute"><Spinner /> Checking this wallet…</p>
                  ) : (
                    <UsernameClaimForm
                      address={newWallet.address}
                      sign={(m) => wallet.softwareSignerFor(newWallet.id, 0).signMessage!(m)}
                      onDone={(c) => {
                        setClaimed(c.username)
                        setStep('done')
                      }}
                      autoFocus
                    />
                  )}
                </div>
                <p className="mt-3 text-xs text-dim">Your username is public and shows your wallet address to anyone who looks it up.</p>
                <button className="mt-4 w-full text-center text-xs text-mute transition hover:text-white" onClick={() => setStep('done')}>
                  Skip for now, add one later in Settings
                </button>
              </>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-ok" />
            <h2 className="mt-4 font-display text-2xl font-bold">{claimed ? `You're @${claimed}` : 'Your wallet is ready'}</h2>
            <p className="mt-2 text-sm text-mute">Every InWIF feature is free, for every user. No subscriptions, no paywalls, and you never need $WIF to use the wallet.</p>
            {createdId && (
              <div className="mt-5 text-left">
                <Notice tone="warn">
                  Back up your recovery phrase before you add funds. It is the only way to restore this wallet if you lose this device or clear your browser.
                </Notice>
                <button className="btn-ghost mt-3 w-full" onClick={() => setBackupOpen(true)}>
                  <KeyRound className="h-4 w-4" /> Back up now
                </button>
                <BackupModal walletId={createdId} open={backupOpen} onClose={() => setBackupOpen(false)} />
              </div>
            )}
            <Link href="/app" className="btn-primary mt-3 w-full" onClick={onFinished}>
              Open my wallet
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  )
}
