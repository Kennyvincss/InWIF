'use client'
import { useId } from 'react'

/**
 * InWIF mark: a rising disc over a flat horizon (World Is Flat) with a keyhole
 * cut through it (self-custody). Original artwork for InWIF.
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  // Unique gradient IDs per instance: a shared ID resolves to the first copy in the page,
  // and if that copy is hidden (e.g. the desktop sidebar on a phone) the gradient disappears.
  const id = useId().replace(/:/g, '')
  const disc = `inwif-disc-${id}`
  const edge = `inwif-edge-${id}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={disc} x1="12" y1="20" x2="52" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00E59B" />
          <stop offset="1" stopColor="#22E5FF" />
        </linearGradient>
        <linearGradient id={edge} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity=".06" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="18" fill="#050506" stroke={`url(#${edge})`} strokeWidth="1.5" />
      <path d="M12 40a20 20 0 0 1 40 0Z" fill={`url(#${disc})`} />
      <circle cx="32" cy="30" r="4.2" fill="#050506" />
      <path d="M30 32.5h4l1.2 7.5h-6.4Z" fill="#050506" />
      <rect x="10" y="43" width="44" height="3.5" rx="1.75" fill="#fff" />
      <rect x="18" y="49.5" width="28" height="2.5" rx="1.25" fill="#fff" fillOpacity=".35" />
    </svg>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-[1.12rem] font-semibold">
        In<span className="text-accent">WIF</span>
      </span>
    </span>
  )
}
