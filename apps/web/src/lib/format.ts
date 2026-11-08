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

/** A $WIF amount for display: 9.36M, 12,450, 3.5, 0.0042. */
export function fmtWif(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1_000_000) return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v)
  if (a >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 0 : 2 })
  if (a === 0) return '0'
  return v.toLocaleString('en-US', { maximumSignificantDigits: 3 })
}

export type DisplayCurrency = 'WIF' | 'USD'

/**
 * A USD value shown in the user's display currency. In WIF mode the value is converted at
 * the live $WIF price; without a price it falls back to USD rather than guessing.
 */
export function fmtValue(usd: number | null | undefined, currency: DisplayCurrency, wifPriceUsd: number | null | undefined): string {
  if (currency === 'WIF' && usd !== null && usd !== undefined && wifPriceUsd && wifPriceUsd > 0) return `${fmtWif(usd / wifPriceUsd)} WIF`
  return fmtUsd(usd)
}
