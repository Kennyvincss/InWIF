'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Minimize2, X } from 'lucide-react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { checkMnemonic } from '@inwif/core'
import { useHardware } from '@/lib/hardware'
import { cx } from './ui'

/** The simulated device: everything inside the "aluminium" frame happens "on the device". */
export function DeviceFrame({ children, onReject, onApprove, label = 'InWIF One' }: { children: React.ReactNode; onReject?: () => void; onApprove?: () => void; label?: string }) {
  return (
    <div className="relative mx-auto w-[300px] rounded-[30px] bg-gradient-to-b from-[#3a414d] via-[#262c35] to-[#171b21] p-[3px] shadow-[0_30px_60px_-20px_rgba(0,0,0,.8)]">
      <div className="rounded-[28px] bg-gradient-to-b from-[#2b313b] to-[#1a1e25] p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">{label}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_#00E59B]" />
        </div>
        <div className="min-h-[220px] rounded-2xl border border-black/60 bg-[#05070a] p-3 font-mono text-[12px] leading-relaxed text-accent-soft shadow-inner">
          {children}
        </div>
        <div className="mt-4 flex items-center justify-between px-2">
          <button
            aria-label="Reject on device"
            onClick={onReject}
            disabled={!onReject}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#3b424e] to-[#22272f] text-bad shadow-md ring-1 ring-black/50 transition active:scale-95 disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="h-1 w-14 rounded-full bg-black/40" title="USB-C" />
          <button
            aria-label="Approve on device"
            onClick={onApprove}
            disabled={!onApprove}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#3b424e] to-[#22272f] text-accent shadow-md ring-1 ring-black/50 transition active:scale-95 disabled:opacity-30"
          >
            <Check className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function SimulatorScreen() {
  const h = useHardware()
  const [pin, setPin] = useState('')
  const [phrase, setPhrase] = useState('')
  const [mode, setMode] = useState<'menu' | 'new' | 'restore'>('menu')
  const [err, setErr] = useState<string | null>(null)
  const sim = h.simulator
  const st = h.simState

  if (!sim || !st) return <DeviceFrame>Device off</DeviceFrame>

  if (h.pending) {
    const p = h.pending.prompt
    return (
      <DeviceFrame onReject={() => h.pending!.resolve(false)} onApprove={() => h.pending!.resolve(true)}>
        <p className="mb-2 font-bold uppercase text-accent">{p.title}</p>
        <div className="max-h-[230px] space-y-1.5 overflow-y-auto pr-1">
          {p.lines.map((l) => (
            <div key={l.label}>
              <span className="text-white/40">{l.label}</span>
              <div className="break-all text-white">{l.value}</div>
            </div>
          ))}
          {p.warnings.map((w) => (
            <div key={w} className="rounded border border-bad/40 bg-bad/10 p-1.5 text-[#ffc2c7]">
              ⚠ {w}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-white/40">✕ reject · ✓ approve</p>
      </DeviceFrame>
    )
  }

  if (h.recoveryWords) {
    return (
      <DeviceFrame onApprove={() => h.clearRecoveryWords()}>
        <p className="mb-2 font-bold text-accent">WRITE DOWN THESE WORDS</p>
        <ol className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-white">
          {h.recoveryWords.map((w, i) => (
            <li key={i}>
              <span className="text-white/40">{i + 1}.</span> {w}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[10px] text-white/50">Shown only on this screen. Press ✓ when done.</p>
      </DeviceFrame>
    )
  }

  if (!st.initialized) {
    return (
      <DeviceFrame>
        {st.wiped && <p className="mb-2 text-bad">Device wiped after too many wrong PINs.</p>}
        {mode === 'menu' && (
          <div className="space-y-2">
            <p className="text-accent">Welcome. Set up this device:</p>
            <button className="w-full rounded border border-accent/30 px-2 py-1.5 text-left hover:bg-accent/10" onClick={() => setMode('new')}>
              ▸ Create new wallet on device
            </button>
            <button className="w-full rounded border border-accent/30 px-2 py-1.5 text-left hover:bg-accent/10" onClick={() => setMode('restore')}>
              ▸ Restore from recovery phrase
            </button>
          </div>
        )}
        {mode !== 'menu' && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              setErr(null)
              try {
                if (mode === 'restore') {
                  const c = checkMnemonic(phrase)
                  if (!c.ok) throw new Error(c.error)
                  sim.restore(phrase, pin)
                } else sim.setupNew(pin)
                setPin('')
                setPhrase('')
                void h.refreshInfo()
              } catch (e2) {
                setErr((e2 as Error).message)
              }
            }}
          >
            {mode === 'restore' && (
              <textarea
                className="h-20 w-full resize-none rounded border border-white/10 bg-black p-1.5 text-white outline-none"
                placeholder="recovery phrase (typed on device)"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            )}
            <input
              className="w-full rounded border border-white/10 bg-black p-1.5 text-white outline-none"
              placeholder="Choose PIN (6–8 digits)"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            {err && <p className="text-bad">{err}</p>}
            <div className="flex gap-2">
              <button type="button" className="flex-1 rounded border border-white/10 py-1" onClick={() => setMode('menu')}>
                Back
              </button>
              <button className="flex-1 rounded bg-accent py-1 font-bold text-black">OK</button>
            </div>
          </form>
        )}
      </DeviceFrame>
    )
  }

  if (st.locked) {
    return (
      <DeviceFrame>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!sim.unlock(pin)) setErr(`Wrong PIN. ${sim.state.pinAttemptsLeft} attempts left before wipe.`)
            else setErr(null)
            setPin('')
          }}
        >
          <p className="text-accent">LOCKED · enter PIN</p>
          <input
            className="w-full rounded border border-white/10 bg-black p-1.5 text-center tracking-[0.5em] text-white outline-none"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            aria-label="Device PIN"
          />
          {err && <p className="text-bad">{err}</p>}
          <button className="w-full rounded bg-accent py-1 font-bold text-black">Unlock</button>
        </form>
      </DeviceFrame>
    )
  }

  return (
    <DeviceFrame>
      <p className="text-accent">READY</p>
      <p className="mt-2 text-white/70">Firmware {st.firmware}</p>
      <p className="text-white/70">Serial {sim.serial}</p>
      <p className="mt-3 text-white/50">Waiting for a request from the companion app…</p>
      <button className="mt-4 rounded border border-white/10 px-2 py-1 text-white/60 hover:text-white" onClick={() => sim.lock()}>
        Lock device
      </button>
    </DeviceFrame>
  )
}

/** Floating panel so the device is visible wherever a prompt arrives. */
export function DevicePanel() {
  const h = useHardware()
  const path = usePathname()
  // The hardware page renders the device inline.
  if (!h.simulator || path.startsWith('/app/hardware')) return null
  return (
    <AnimatePresence>
      {h.panelOpen ? (
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          className="fixed bottom-4 right-4 z-[60] rounded-3xl border border-white/10 bg-ink-950/95 p-4 backdrop-blur"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="chip">Simulator · not secure hardware</span>
            <button className="rounded p-1 text-mute hover:text-white" onClick={() => h.setPanelOpen(false)} aria-label="Minimise device">
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
          <SimulatorScreen />
        </motion.div>
      ) : (
        <button
          onClick={() => h.setPanelOpen(true)}
          className={cx('fixed bottom-4 right-4 z-[60] rounded-full border border-accent/30 bg-ink-900 px-4 py-2 text-sm font-semibold shadow-glow', h.pending && 'animate-pulse text-accent')}
        >
          {h.pending ? 'Device needs confirmation' : 'Show device'}
        </button>
      )}
    </AnimatePresence>
  )
}
