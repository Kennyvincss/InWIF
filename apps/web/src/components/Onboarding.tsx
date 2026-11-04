'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Cpu, Eye, EyeOff, Fingerprint, KeyRound, Plus, ScanEye, ShieldCheck } from 'lucide-react'
import {
  accountFromMnemonic,
  checkMnemonic,
  checkPassword,
  checkRecipient,
  createMnemonic,
  normaliseMnemonic,
  normalisePrivateKey,
  pickVerificationIndices,
  verifyBackupWords,
} from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { LogoMark } from './Logo'
import { ErrorBox, Notice, Spinner, cx } from './ui'

type Step = 'welcome' | 'show' | 'verify' | 'import' | 'watch' | 'password' | 'biometric' | 'done'

export function Onboarding({ embedded = false, onFinished }: { embedded?: boolean; onFinished?: () => void }) {
  const wallet = useWallet()
  const [step, setStep] = useState<Step>('welcome')
  const [strength, setStrength] = useState<128 | 256>(128)
  const [phrase, setPhrase] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [quiz, setQuiz] = useState<number[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [importMode, setImportMode] = useState<'phrase' | 'key'>('phrase')
  const [importInput, setImportInput] = useState('')
  const [watchInput, setWatchInput] = useState('')
  const [name, setName] = useState('Main wallet')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [source, setSource] = useState<'create' | 'phrase' | 'key'>('create')

  const words = useMemo(() => phrase.split(' '), [phrase])
  const pwCheck = checkPassword(pw)
  const importCheck = importMode === 'phrase' ? checkMnemonic(importInput) : null
  const importKey = importMode === 'key' ? normalisePrivateKey(importInput) : null

  function startCreate() {
    setPhrase(createMnemonic(strength))
    setRevealed(false)
    setSource('create')
    setStep('show')
  }

  async function finish() {
    setErr(null)
    if (!pwCheck.ok) return setErr(pwCheck.problems.join(' '))
    if (pw !== pw2) return setErr('Passwords do not match.')
    setBusy(true)
    try {
      if (source === 'key') await wallet.importPrivateKey({ name, privateKey: importKey!, password: pw })
      else await wallet.createFromMnemonic({ name, phrase: source === 'create' ? phrase : normaliseMnemonic(importInput), password: pw, backedUp: true })
      // Clear secrets from component state as soon as they are encrypted.
      setPhrase('')
      setImportInput('')
      setPw('')
      setPw2('')
      setStep('biometric')
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

        {step === 'show' && (
          <div>
            <h2 className="font-display text-2xl font-bold">Your recovery phrase</h2>
            <p className="mt-1 text-sm text-mute">These {words.length} words are the only way to recover your wallet. Write them on paper, in order. Never type them into a website or share them.</p>
            <div className="relative mt-5">
              <ol className={cx('grid grid-cols-2 gap-2 sm:grid-cols-3', !revealed && 'select-none blur-md')}>
                {words.map((w, i) => (
                  <li key={i} className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm">
                    <span className="mr-2 text-mute">{i + 1}</span>
                    <span className="font-medium">{w}</span>
                  </li>
                ))}
              </ol>
              {!revealed && (
                <button className="btn-ghost absolute inset-0 m-auto h-fit w-fit" onClick={() => setRevealed(true)}>
                  <Eye className="h-4 w-4" /> Reveal (make sure nobody is watching)
                </button>
              )}
            </div>
            <Notice tone="warn">InWIF never stores your phrase on a server and cannot recover it for you. Anyone with these words controls your funds.</Notice>
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost" onClick={() => setRevealed(false)}>
                <EyeOff className="h-4 w-4" /> Hide
              </button>
              <button
                className="btn-primary flex-1"
                disabled={!revealed}
                onClick={() => {
                  setQuiz(pickVerificationIndices(words.length, 3))
                  setAnswers({})
                  setStep('verify')
                }}
              >
                I wrote it down
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div>
            <h2 className="font-display text-2xl font-bold">Verify your backup</h2>
            <p className="mt-1 text-sm text-mute">Enter the requested words from your written copy.</p>
            <div className="mt-5 space-y-3">
              {quiz.map((i) => (
                <div key={i}>
                  <label className="label" htmlFor={`w${i}`}>
                    Word #{i + 1}
                  </label>
                  <input id={`w${i}`} className="input" autoComplete="off" spellCheck={false} value={answers[i] ?? ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                </div>
              ))}
            </div>
            {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost" onClick={() => setStep('show')}>
                Back
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  if (verifyBackupWords(phrase, answers)) {
                    setErr(null)
                    setStep('password')
                  } else setErr('One or more words do not match. Check your written copy.')
                }}
              >
                Verify
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
            <h2 className="font-display text-2xl font-bold">Protect this wallet</h2>
            <p className="mt-1 text-sm text-mute">
              Your keys are encrypted on this device with AES-256-GCM using a key derived from this password (PBKDF2, 600,000 iterations). Each wallet is encrypted separately.
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
              {busy ? <Spinner /> : <ShieldCheck className="h-4 w-4" />} Encrypt & finish
            </button>
          </form>
        )}

        {step === 'biometric' && (
          <div>
            <Fingerprint className="h-10 w-10 text-lime" />
            <h2 className="mt-4 font-display text-2xl font-bold">Biometric unlock</h2>
            <p className="mt-2 text-sm text-mute">
              Face ID, Touch ID and fingerprint unlock are provided by the InWIF mobile and desktop apps through the operating system&apos;s secure storage (Keychain / Android
              Keystore). Browsers cannot hold wallet keys behind biometrics safely, so the web wallet uses your password.
            </p>
            <button className="btn-primary mt-6 w-full" onClick={() => setStep('done')}>
              Continue
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-ok" />
            <h2 className="mt-4 font-display text-2xl font-bold">You&apos;re set</h2>
            <p className="mt-2 text-sm text-mute">Every InWIF feature is free, for every user. No subscriptions, no paywalls, and you never need $WIF to use the wallet.</p>
            <Link href="/app" className="btn-primary mt-6 w-full" onClick={onFinished}>
              Open my wallet
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  )
}
