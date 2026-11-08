'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Logo } from '../Logo'
import { cx } from '../ui'

export const SITE_NAV = [
  { href: '/', label: 'Home' },
  { href: '/app', label: 'Wallet' },
  { href: '/#features', label: 'Features' },
  { href: '/ecosystem', label: '$WIF' },
  { href: '/hardware', label: 'Hardware' },
  { href: '/security', label: 'Security' },
  { href: '/docs', label: 'Docs' },
]

/** Floating glass navigation pill. */
export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const path = usePathname()
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cx(
          'mx-auto flex max-w-6xl items-center gap-4 rounded-2xl border px-3 py-2 transition-[background-color,border-color,box-shadow] sm:px-4',
          scrolled ? 'border-white/[0.09] bg-black/70 shadow-[0_20px_60px_-30px_rgba(0,0,0,1)] backdrop-blur-xl' : 'border-transparent bg-transparent',
        )}
      >
        <Link href="/" aria-label="InWIF home" className="shrink-0">
          <Logo />
        </Link>
        <nav className="mx-auto hidden items-center gap-0.5 rounded-full border border-white/[0.07] bg-white/[0.02] p-1 lg:flex">
          {SITE_NAV.slice(1).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                'rounded-full px-3.5 py-1.5 text-[13px] transition',
                path === n.href ? 'bg-white/[0.08] text-white' : 'text-mute hover:bg-white/[0.04] hover:text-white',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Link href="/app" className="btn-primary py-2">
            Launch wallet <ArrowUpRight className="h-4 w-4" />
          </Link>
          <button className="rounded-xl border border-white/[0.08] p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="card mx-auto mt-2 max-w-6xl p-2 lg:hidden">
          {SITE_NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-mute transition hover:bg-white/[0.04] hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="relative mt-10 border-t border-white/[0.06]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-[1.4fr,1fr,1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-mute">Your assets. Your keys. Your control. A free self-custody wallet for Robinhood Chain and the World Is Flat community.</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
            <span className="live-dot" /> Free forever · 0% fees
          </p>
        </div>
        <div>
          <p className="label">Product</p>
          <ul className="space-y-2.5 text-sm text-mute">
            <li><Link href="/app" className="transition hover:text-white">Web wallet</Link></li>
            <li><Link href="/ecosystem" className="transition hover:text-white">$WIF ecosystem</Link></li>
            <li><Link href="/hardware" className="transition hover:text-white">Hardware wallet</Link></li>
            <li><Link href="/security" className="transition hover:text-white">Security</Link></li>
          </ul>
        </div>
        <div>
          <p className="label">Resources</p>
          <ul className="space-y-2.5 text-sm text-mute">
            <li><Link href="/docs" className="transition hover:text-white">Documentation</Link></li>
            <li><Link href="/docs#faq" className="transition hover:text-white">FAQ</Link></li>
            <li><Link href="/docs#privacy" className="transition hover:text-white">Privacy</Link></li>
            <li><Link href="/docs#terms" className="transition hover:text-white">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} InWIF. Pre-release software, not yet independently audited.</span>
          <span className="font-mono uppercase tracking-[0.14em]">No subscriptions · No paywalls · No InWIF fees</span>
        </div>
      </div>
    </footer>
  )
}

export function Section({
  id,
  eyebrow,
  title,
  children,
  className = '',
  center = false,
  intro,
}: {
  id?: string
  eyebrow?: string
  title: React.ReactNode
  children: React.ReactNode
  className?: string
  center?: boolean
  intro?: React.ReactNode
}) {
  return (
    <section id={id} className={cx('mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:py-28', className)}>
      <div className={cx(center && 'mx-auto text-center')}>
        {eyebrow && (
          <p className="eyebrow mb-4">
            <span className="h-px w-6 bg-accent/60" /> {eyebrow}
          </p>
        )}
        <h2 className={cx('max-w-4xl font-display text-[32px] font-semibold leading-[1.08] sm:text-[44px]', center && 'mx-auto')}>{title}</h2>
        {intro && <p className={cx('mt-5 max-w-2xl text-base leading-relaxed text-mute sm:text-lg', center && 'mx-auto')}>{intro}</p>}
      </div>
      <div className="mt-12">{children}</div>
    </section>
  )
}

export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="ambient min-h-screen">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}
