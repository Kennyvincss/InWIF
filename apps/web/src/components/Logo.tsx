/**
 * InWIF logo: the beanie-and-shades emblem in a hexagon, with the "InWIF" wordmark.
 * The emblem is a transparent PNG made from the brand artwork (public/brand/emblem.png).
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const w = Math.round(size * 0.94)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={size > 48 ? '/brand/emblem.png' : '/brand/emblem-96.png'} alt="" aria-hidden width={w} height={size} className={className} style={{ width: w, height: size, objectFit: 'contain' }} />
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="font-display text-[1.25rem] font-bold tracking-[-0.03em]">
        In<span className="text-accent">WIF</span>
      </span>
    </span>
  )
}
