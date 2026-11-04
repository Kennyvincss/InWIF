import { formatUnits } from 'viem'

export function fmtToken(raw: bigint | string, decimals: number, maxFrac = 6): string {
  const v = formatUnits(BigInt(raw), decimals)
  const [i, f = ''] = v.split('.')
  const intPart = Number(i).toLocaleString('en-US')
  const frac = f.slice(0, maxFrac).replace(/0+$/, '')
  if (!frac && BigInt(raw) > 0n && i === '0') return `<0.${'0'.repeat(maxFrac - 1)}1`
  return frac ? `${intPart}.${frac}` : intPart
}

export function fmtUsd(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (opts.compact && Math.abs(v) >= 10_000)
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(v)
  const digits = Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 6 : 2
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }).format(v)
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function timeAgo(iso?: string): string {
  if (!iso) return 'pending'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function toNumber(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals))
}
