'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Info, Loader2, ShieldAlert, X, XCircle } from 'lucide-react'
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx('card max-h-[92vh] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-b-none bg-[#08080A]/95 p-6 sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
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
    lime: 'border-accent/30 bg-accent/10 text-accent',
    mute: 'border-white/10 bg-white/[0.04] text-mute',
  }
  return <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>
}

export type CalloutTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger'

const CALLOUT_ICON = { neutral: Info, info: Info, ok: CheckCircle2, warn: AlertTriangle, danger: ShieldAlert }

/** Notice / warning / error panel in the site's glass style. */
export function Callout({
  tone = 'neutral',
  title,
  icon,
  action,
  size = 'md',
  className,
  children,
  ...rest
}: {
  tone?: CalloutTone
  title?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  const Icon = CALLOUT_ICON[tone]
  return (
    <div className={cx('callout', size === 'sm' && 'callout-sm', action && 'flex-wrap sm:flex-nowrap', className)} data-tone={tone} {...rest}>
      <span className="callout-icon">{icon ?? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}</span>
      <div className={cx('min-w-0 flex-1 self-center break-words', action && 'basis-[calc(100%-2.5rem)] sm:basis-auto')}>
        {title && <p className="callout-title">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="ml-10 w-[calc(100%-2.5rem)] shrink-0 self-center sm:ml-0 sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  )
}

/** Inline feedback under a form field. */
export function FieldHint({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger'; children: React.ReactNode; className?: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warn' ? AlertTriangle : Info
  return (
    <p className={cx('field-hint', className)} data-tone={tone}>
      <Icon className="h-3.5 w-3.5" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

export function Findings({ findings, hideInfo }: { findings: Finding[]; hideInfo?: boolean }) {
  const list = hideInfo ? findings.filter((f) => f.severity !== 'info') : findings
  if (!list.length) return null
  return (
    <ul className="space-y-2">
      {list.map((f) => (
        <li key={f.code + f.message}>
          <Callout size="sm" tone={f.severity === 'danger' ? 'danger' : f.severity === 'warning' ? 'warn' : f.message.startsWith('✓') ? 'ok' : 'neutral'}>
            {f.message.replace(/^✓\s*/, '')}
          </Callout>
        </li>
      ))}
    </ul>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <Callout tone="danger">{children}</Callout>
}

export function Notice({ children, tone = 'mute' }: { children: React.ReactNode; tone?: 'mute' | 'lime' | 'warn' | 'info' }) {
  return <Callout tone={tone === 'lime' ? 'ok' : tone === 'warn' ? 'warn' : tone === 'info' ? 'info' : 'neutral'}>{children}</Callout>
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.01] px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-mute shadow-[0_0_30px_-10px_rgba(255,255,255,.25)]">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-mute">{children}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-white/[0.05]', className)} />
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-3 text-sm last:border-0">
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
  const palette: Record<string, string> = { ETH: '#8EA2FF', WIF: '#00E59B', WETH: '#B6C1FF', USDG: '#62D99A', cbBTC: '#F7A64B' }
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
        <button key={p} type="button" className="chip hover:border-accent/40 hover:text-accent disabled:opacity-40" disabled={disabled} onClick={() => onPick(p)}>
          {p}%
        </button>
      ))}
    </div>
  )
}

/** A deterministic gradient "avatar" for an address. */
export function AddressAvatar({ address, size = 28 }: { address?: string; size?: number }) {
  const h = address ? parseInt(address.slice(2, 8), 16) % 360 : 160
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-white/15"
      style={{ width: size, height: size, background: `conic-gradient(from ${h}deg, hsl(${h} 90% 55%), hsl(${(h + 80) % 360} 90% 60%), hsl(${(h + 200) % 360} 85% 50%), hsl(${h} 90% 55%))` }}
    />
  )
}
