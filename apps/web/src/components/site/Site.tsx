'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from '../Logo'

export const SITE_NAV = [
  { href: '/', label: 'Home' },
  { href: '/app', label: 'Wallet' },
  { href: '/hardware', label: 'Hardware' },
  { href: '/#features', label: 'Features' },
  { href: '/ecosystem', label: '$WIF Ecosystem' },
  { href: '/docs', label: 'Documentation' },
  { href: '/security', label: 'Security' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3.5">
        <Link href="/" aria-label="InWIF home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.slice(1).map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-sm text-mute transition hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/app" className="btn-primary">
            Get Started
          </Link>
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-white/[0.06] px-5 py-3 lg:hidden">
          {SITE_NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-mute hover:text-white">
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
    <footer className="border-t border-white/[0.06] bg-ink-900/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-mute">Your Assets. Your Keys. Your Control. A free, open self-custody wallet for Robinhood Chain and the World Is Flat community.</p>
          <p className="mt-4 text-xs text-mute">
            InWIF is pre-release software and has not been independently audited. The InWIF One hardware wallet is a prototype; images are concept renders.
          </p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Product</p>
          <ul className="space-y-2 text-sm text-mute">
            <li><Link href="/app" className="hover:text-white">Web wallet</Link></li>
            <li><Link href="/hardware" className="hover:text-white">Hardware wallet</Link></li>
            <li><Link href="/ecosystem" className="hover:text-white">$WIF ecosystem</Link></li>
            <li><Link href="/security" className="hover:text-white">Security</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Resources</p>
          <ul className="space-y-2 text-sm text-mute">
            <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
            <li><Link href="/docs#faq" className="hover:text-white">FAQ</Link></li>
            <li><Link href="/docs#privacy" className="hover:text-white">Privacy</Link></li>
            <li><Link href="/docs#terms" className="hover:text-white">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.06] py-5 text-center text-xs text-mute">InWIF is free. No subscriptions. No premium plans. No paywalls. No InWIF fees.</div>
    </footer>
  )
}

export function Section({ id, eyebrow, title, children, className = '' }: { id?: string; eyebrow?: string; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:py-24 ${className}`}>
      {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-lime">{eyebrow}</p>}
      <h2 className="max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  )
}

export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}
