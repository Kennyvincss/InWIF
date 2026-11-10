'use client'
/**
 * Back up a wallet's recovery phrase: confirm the password, reveal the words,
 * then prove they were written down by entering three of them.
 */
import { useMemo, useState } from 'react'
import { Eye, KeyRound, ShieldCheck } from 'lucide-react'
import { pickVerificationIndices, verifyBackupWords } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { ErrorBox, Modal, Notice, Spinner, cx } from './ui'

type Step = 'password' | 'show' | 'verify' | 'done'

export function BackupModal({ walletId, open, onClose }: { walletId: string; open: boolean; onClose: () => void }) {
  const { revealSecret, markBackedUp, state } = useWallet()
  const wallet = state.wallets.find((w) => w.id === walletId)
  const [step, setStep] = useState<Step>('password')
  const [pw, setPw] = useState('')
  const [phrase, setPhrase] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [quiz, setQuiz] = useState<number[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const words = useMemo(() => (phrase ? phrase.split(' ') : []), [phrase])

  const close = () => {
    // Drop the phrase from memory as soon as the dialog closes.
    setPhrase('')
    setPw('')
    setAnswers({})
    setRevealed(false)
    setErr(null)
    setStep('password')
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Back up your recovery phrase">
      {step === 'password' && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setErr(null)
            setBusy(true)
            try {
              const s = await revealSecret(walletId, pw)
              if (s.kind !== 'mnemonic') throw new Error('This wallet was imported with a private key and has no recovery phrase.')
              setPhrase(s.phrase)
              setPw('')
              setStep('show')
            } catch (e2) {
              setErr((e2 as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <p className="text-sm text-mute">
            Your recovery phrase is the only way to restore <b className="text-fg">{wallet?.name ?? 'this wallet'}</b> if you lose this device or clear your browser. InWIF can never
            recover it for you.
          </p>
          <label className="label" htmlFor="backup-pw">
            <KeyRound className="mr-1 inline h-3 w-3" /> Wallet password
          </label>
          <input id="backup-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus />
          {err && <ErrorBox>{err}</ErrorBox>}
          <button className="btn-primary w-full" disabled={!pw || busy}>
            {busy ? <Spinner /> : null} Continue
          </button>
        </form>
      )}

      {step === 'show' && (
        <div className="space-y-4">
          <p className="text-sm text-mute">Write these {words.length} words on paper, in order. Never type them into a website or share them.</p>
          <div className="relative">
            <ol className={cx('grid grid-cols-2 gap-2 sm:grid-cols-3', !revealed && 'select-none blur-md')}>
              {words.map((w, i) => (
                <li key={i} className="rounded-xl border border-fg/10 bg-ink-900 px-3 py-2 text-sm">
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
          <Notice tone="warn">Anyone with these words controls your funds.</Notice>
          <button
            className="btn-primary w-full"
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
      )}

      {step === 'verify' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (verifyBackupWords(phrase, answers, quiz)) {
              markBackedUp(walletId)
              setPhrase('')
              setErr(null)
              setStep('done')
            } else setErr('One or more words do not match. Check your written copy.')
          }}
        >
          <p className="text-sm text-mute">Enter the requested words from your written copy.</p>
          {quiz.map((i) => (
            <div key={i}>
              <label className="label" htmlFor={`bw${i}`}>
                Word #{i + 1}
              </label>
              <input id={`bw${i}`} className="input" autoComplete="off" spellCheck={false} value={answers[i] ?? ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
            </div>
          ))}
          {err && <ErrorBox>{err}</ErrorBox>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep('show')}>
              Back
            </button>
            <button className="btn-primary flex-1">Verify</button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-ok" />
          <p className="font-display text-lg font-bold">Backup verified</p>
          <p className="text-sm text-mute">Keep your written phrase somewhere safe and offline.</p>
          <button className="btn-primary w-full" onClick={close}>
            Done
          </button>
        </div>
      )}
    </Modal>
  )
}
