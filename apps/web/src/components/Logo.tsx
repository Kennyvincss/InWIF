/**
 * InWIF logo: the orange beanie-and-shades emblem on a rounded dark tile, with the
 * "InWIF" wordmark (public/brand/emblem.png).
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={size > 48 ? '/brand/emblem.png' : '/brand/emblem-96.png'} alt="" aria-hidden width={size} height={size} className={className} style={{ width: size, height: size }} />
  )
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-[1.35rem] font-bold tracking-[-0.03em] text-fg">
        In<span className="text-accent">WIF</span>
      </span>
    </span>
  )
}
