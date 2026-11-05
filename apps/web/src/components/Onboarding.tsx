'use client'
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Cpu, KeyRound, Plus, ScanEye, ShieldCheck } from 'lucide-react'
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
import { ErrorBox, Notice, Spinner, cx } from './ui'

type Step = 'welcome' | 'import' | 'watch' | 'password' | 'done'

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
      if (source === 'key') await wallet.importPrivateKey({ name, privateKey: importKey!, password: pw })
      else {
        // A created phrase is not backed up yet; an imported one already exists on paper.
        const w = await wallet.createFromMnemonic({ name, phrase: source === 'create' ? phrase : normaliseMnemonic(importInput), password: pw, backedUp: source !== 'create' })
        setCreatedId(source === 'create' ? w.id : null)
      }
      // Clear secrets from component state as soon as they are encrypted.
      setPhrase('')
      setImportInput('')
      setPw('')
      setPw2('')
      setStep('done')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const card = 'card w-full max-w-xl p-6 sm:p-8'

  return (
    <div className={cx('flex items-center justify-center', !embedded && 'min-h-[80vh]')}>
      <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={card}>
        {step === 'welcome' && (
          <div>
            <LogoMark size={44} />
            <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight">Welcome to InWIF</h1>
            <p className="mt-2 text-mute">Your assets. Your keys. Your control. Keys are generated and encrypted on this device and never sent anywhere.</p>
            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <Plus className="h-5 w-5 text-lime" />
                  <div className="flex-1">
                    <p className="font-semibold">Create a new wallet</p>
                    <p className="text-xs text-mute">Generates a BIP-39 recovery phrase locally.</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
                    {([128, 256] as const).map((s) => (
                      <button key={s} className={cx('rounded-md px-2.5 py-1', strength === s ? 'bg-white/10 text-white' : 'text-mute')} onClick={() => setStrength(s)}>
                        {s === 128 ? '12 words' : '24 words'}
                      </button>
                    ))}
                  </div>
                  <button className="btn-primary ml-auto" onClick={startCreate}>
                    Create wallet
                  </button>
                </div>
              </div>
              <button className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left hover:bg-white/[0.03]" onClick={() => setStep('import')}>
                <KeyRound className="h-5 w-5 text-lime" />
                <div>
                  <p className="font-semibold">Import an existing wallet</p>
                  <p className="text-xs text-mute">Recovery phrase or private key, validated locally.</p>
                </div>
              </button>
              <Link href="/app/hardware" className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 hover:bg-white/[0.03]" onClick={onFinished}>
                <Cpu className="h-5 w-5 text-lime" />
                <div>
                  <p className="font-semibold">Connect a hardware wallet</p>
                  <p className="text-xs text-mute">InWIF device (USB-C) or the built-in device simulator.</p>
                </div>
              </Link>
              <button className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-left hover:bg-white/[0.03]" onClick={() => setStep('watch')}>
                <ScanEye className="h-5 w-5 text-lime" />
                <div>
                  <p className="font-semibold">Watch an address</p>
                  <p className="text-xs text-mute">Track any public address. No keys, cannot sign.</p>
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
                  <p className="text-ok">Valid {importCheck.wordCount}-word phrase · first address {accountFromMnemonic(importInput, 0).address}</p>
                ) : (
                  <p className="text-bad">
                    {importCheck?.error}
                    {importCheck?.unknownWords.length ? ` Unknown: ${importCheck.unknownWords.slice(0, 5).join(', ')}` : ''}
                  </p>
                )
              )}
              {importMode === 'key' && importInput && (importKey ? <p className="text-ok">Valid private key.</p> : <p className="text-bad">Not a valid secp256k1 private key.</p>)}
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
            {watchInput && !checkRecipient(watchInput).ok && <p className="mt-2 text-xs text-bad">{checkRecipient(watchInput).findings[0]?.message}</p>}
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
                {pw && !pwCheck.ok && <p className="mt-1 text-xs text-warn">{pwCheck.problems.join(' ')}</p>}
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

        {step === 'done' && (
          <div className="text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-ok" />
            <h2 className="mt-4 font-display text-2xl font-bold">Your wallet is ready</h2>
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
