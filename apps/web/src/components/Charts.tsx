'use client'
import { useId, useMemo, useRef, useState } from 'react'
import type { PricePoint } from '@inwif/core'
import { fmtUsd } from '@/lib/format'

/**
 * Categorical slots for the true-black theme: electric cyan first, then hues spaced around the
 * wheel at similar brightness so neighbours stay distinct (including for common colour-vision
 * deficiencies) against #000–#0A0A0B surfaces.
 */
export const SERIES = ['#22E5FF', '#00E59B', '#F5C451', '#FF6B9A', '#9B8CFF', '#FF8A4C']

/** Single-series area chart with crosshair tooltip and a table fallback. */
export function AreaChart({ data, height = 200, label, format = fmtUsd }: { data: PricePoint[]; height?: number; label: string; format?: (v: number) => string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const fillId = `area-fill-${useId().replace(/:/g, '')}`
  const W = 800
  const H = height
  const pad = { t: 12, r: 8, b: 22, l: 8 }
  const { path, area, xs, ys, min, max } = useMemo(() => {
    if (data.length < 2) return { path: '', area: '', xs: [], ys: [], min: 0, max: 0 }
    const t0 = data[0]!.t
    const t1 = data[data.length - 1]!.t
    const vals = data.map((d) => d.close)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    // Keep at least a 5% vertical range so tiny moves (e.g. a 0.1% wobble) look tiny, not dramatic.
    const minSpan = Math.abs(hi) * 0.05
    const mid = (lo + hi) / 2
    const mn = hi - lo < minSpan ? mid - minSpan / 2 : lo
    const mx = hi - lo < minSpan ? mid + minSpan / 2 : hi
    const span = mx - mn || mx || 1
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r)
    const y = (v: number) => pad.t + (1 - (v - mn) / span) * (H - pad.t - pad.b)
    const xs = data.map((d) => x(d.t))
    const ys = data.map((d) => y(d.close))
    const p = xs.map((xx, i) => `${i ? 'L' : 'M'}${xx.toFixed(1)},${ys[i]!.toFixed(1)}`).join('')
    return { path: p, area: `${p}L${xs[xs.length - 1]},${H - pad.b}L${xs[0]},${H - pad.b}Z`, xs, ys, min: lo, max: hi }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, H])

  if (data.length < 2) return null
  const h = hover !== null ? data[hover] : null

  function onMove(clientX: number) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((clientX - r.left) / r.width) * W
    let best = 0
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - px) < Math.abs(xs[best]! - px)) best = i
    setHover(best)
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`${label}: from ${format(data[0]!.close)} to ${format(data[data.length - 1]!.close)}`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? data.length) - 1))
          if (e.key === 'ArrowRight') setHover((v) => Math.min(data.length - 1, (v ?? -1) + 1))
        }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#22E5FF" stopOpacity=".24" />
            <stop offset=".7" stopColor="#22E5FF" stopOpacity=".04" />
            <stop offset="1" stopColor="#22E5FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="rgba(255,255,255,.045)" strokeDasharray="2 4" />
        ))}
        <path d={area} fill={`url(#${fillId})`} />
        <path d={path} fill="none" stroke="#22E5FF" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px rgba(34,229,255,.55))' }} />
        {hover !== null && (
          <>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,.25)" vectorEffect="non-scaling-stroke" />
            <circle cx={xs[hover]} cy={ys[hover]} r={5} fill="#22E5FF" stroke="#000" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 8px rgba(34,229,255,.8))' }} />
          </>
        )}
        <text x={pad.l} y={H - 6} fill="#8A8F98" fontSize={11}>
          {new Date(data[0]!.t * 1000).toLocaleDateString()}
        </text>
        <text x={W - pad.r} y={H - 6} fill="#8A8F98" fontSize={11} textAnchor="end">
          {new Date(data[data.length - 1]!.t * 1000).toLocaleDateString()}
        </text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-white/10 bg-ink-900/95 px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `min(calc(${(xs[hover!]! / W) * 100}% + 8px), calc(100% - 150px))` }}>
          <div className="font-semibold text-white">{format(h.close)}</div>
          <div className="text-mute">{new Date(h.t * 1000).toLocaleString()}</div>
        </div>
      )}
      <details className="mt-1 text-xs text-mute">
        <summary className="cursor-pointer select-none">View as table (min {format(min)} · max {format(max)})</summary>
        <div className="mt-2 max-h-40 overflow-y-auto">
          <table className="w-full">
            <tbody>
              {data.map((d) => (
                <tr key={d.t} className="border-b border-white/5">
                  <td className="py-0.5">{new Date(d.t * 1000).toLocaleString()}</td>
                  <td className="py-0.5 text-right text-white">{format(d.close)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** Stacked allocation bar: 2px gaps between segments, legend always shown. */
export function AllocationBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  const [hover, setHover] = useState<number | null>(null)
  if (total <= 0) return null
  const shown = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const top = shown.slice(0, SERIES.length - 1)
  const other = shown.slice(SERIES.length - 1).reduce((s, i) => s + i.value, 0)
  const segs = other > 0 ? [...top, { label: 'Other', value: other }] : top
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {segs.map((s, i) => (
          <div
            key={s.label}
            className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.value / total) * 100}%`, background: SERIES[i], opacity: hover === null || hover === i ? 1 : 0.45 }}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segs.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-mute" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i] }} />
            <span className="text-white">{s.label}</span> {((s.value / total) * 100).toFixed(1)}%
          </li>
        ))}
      </ul>
    </div>
  )
}
