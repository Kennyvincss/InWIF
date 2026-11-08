'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, Copy, Info, Loader2, ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { Finding } from '@inwif/core'

export const cx = clsx

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={cx('h-4 w-4 animate-spin', className)} aria-label="Loading" />
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  // Render at <body> level: a parent with backdrop-filter/transform (e.g. the blurred header)
  // would otherwise become the containing block and clip this "fixed" overlay.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx('card max-h-[92vh] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-b-none p-5 sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-mute hover:bg-white/5 hover:text-white" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn-ghost px-3 py-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  )
}

export function Badge({ tone = 'mute', children }: { tone?: 'ok' | 'bad' | 'warn' | 'lime' | 'mute'; children: React.ReactNode }) {
  const tones = {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    bad: 'border-bad/30 bg-bad/10 text-bad',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    lime: 'border-lime/30 bg-lime/10 text-lime',
    mute: 'border-white/10 bg-white/[0.04] text-mute',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', tones[tone])}>{children}</span>
}

export function Findings({ findings, hideInfo }: { findings: Finding[]; hideInfo?: boolean }) {
  const list = hideInfo ? findings.filter((f) => f.severity !== 'info') : findings
  if (!list.length) return null
  return (
    <ul className="space-y-2">
      {list.map((f) => (
        <li
          key={f.code + f.message}
          className={cx(
            'flex gap-2 rounded-xl border p-3 text-sm',
            f.severity === 'danger' && 'border-bad/30 bg-bad/10 text-[#ffc2c7]',
            f.severity === 'warning' && 'border-warn/30 bg-warn/10 text-[#ffe7a8]',
            f.severity === 'info' && 'border-white/10 bg-white/[0.03] text-mute',
          )}
        >
          {f.severity === 'danger' ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          ) : f.severity === 'warning' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-[#ffc2c7]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

export function Notice({ children, tone = 'mute' }: { children: React.ReactNode; tone?: 'mute' | 'lime' | 'warn' }) {
  return (
    <div
      className={cx(
        'flex gap-2 rounded-xl border p-3 text-sm',
        tone === 'lime' && 'border-lime/25 bg-lime/[0.06] text-lime-soft',
        tone === 'warn' && 'border-warn/30 bg-warn/10 text-[#ffe7a8]',
        tone === 'mute' && 'border-white/10 bg-white/[0.03] text-mute',
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <div className="mb-3 rounded-2xl bg-white/[0.04] p-3 text-mute">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-mute">{children}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-white/[0.06]', className)} />
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-mute">{label}</span>
      <span className="min-w-0 break-all text-right">{children}</span>
    </div>
  )
}

/** Bundled logos (public/tokens), so no third-party image host sees users' requests. */
const TOKEN_LOGOS: Record<string, string> = {
  ETH: '/tokens/eth.webp',
  WIF: '/tokens/wif.webp',
  WETH: '/tokens/weth.webp',
  USDG: '/tokens/usdg.webp',
  CBBTC: '/tokens/cbbtc.webp',
}

export function TokenIcon({ symbol, src, size = 36 }: { symbol: string; src?: string; size?: number }) {
  const palette: Record<string, string> = { ETH: '#8EA2FF', WIF: '#A6F36A', WETH: '#B6C1FF', USDG: '#62D99A', cbBTC: '#F7A64B' }
  const logo = src ?? TOKEN_LOGOS[symbol.toUpperCase()]
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} className="shrink-0 rounded-full bg-ink-700" style={{ width: size, height: size }} />
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display text-[11px] font-extrabold text-ink-950"
      style={{ width: size, height: size, background: palette[symbol] ?? '#8993A4' }}
      aria-hidden
    >
      {symbol.slice(0, 4)}
    </span>
  )
}

export interface TokenOption {
  key: string
  symbol: string
  /** Shown next to the symbol in the list, e.g. a formatted balance. */
  detail?: string
}

/** Token picker with logos (a native <select> cannot show images). */
export function TokenPicker({ options, value, onChange, label, className }: { options: TokenOption[]; value: string; onChange: (key: string) => void; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.key === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button
        type="button"
        className="input flex w-full items-center gap-2 text-left"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current && <TokenIcon symbol={current.symbol} size={24} />}
        <span className="min-w-0 flex-1 truncate font-semibold">{current?.symbol ?? '—'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-mute" />
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="absolute right-0 z-30 mt-1 max-h-72 min-w-full overflow-auto rounded-xl border border-white/10 bg-ink-800 p-1 shadow-xl">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === value}>
              <button
                type="button"
                className={cx('flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.06]', o.key === value && 'bg-white/[0.04]')}
                onClick={() => {
                  onChange(o.key)
                  setOpen(false)
                }}
              >
                <TokenIcon symbol={o.symbol} size={22} />
                <span className="font-semibold">{o.symbol}</span>
                {o.detail && <span className="ml-auto pl-4 text-xs text-mute">{o.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Quick-fill buttons for a share of the available balance. */
export function PercentButtons({ onPick, disabled }: { onPick: (pct: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {[25, 50, 75, 100].map((p) => (
        <button key={p} type="button" className="chip hover:border-lime/40 hover:text-lime disabled:opacity-40" disabled={disabled} onClick={() => onPick(p)}>
          {p}%
        </button>
      ))}
    </div>
  )
}
