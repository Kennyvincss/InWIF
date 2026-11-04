'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Cpu,
  History,
  Landmark,
  LayoutDashboard,
  Lock,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { NETWORKS, shortAddress } from '@inwif/core'
import { Logo } from './Logo'
import { Badge, cx } from './ui'
import { useWallet } from '@/lib/wallet-store'
import { useVerification } from '@/lib/hooks'
import { useNotify } from '@/lib/notifications'
import { SELECTABLE_NETWORKS } from '@/lib/net'
import { DevicePanel } from './DevicePanel'
import { timeAgo } from '@/lib/format'

const NAV = [
  { href: '/app', label: 'Portfolio', icon: LayoutDashboard },
  { href: '/app/send', label: 'Send', icon: ArrowUpRight },
  { href: '/app/receive', label: 'Receive', icon: ArrowDownLeft },
  { href: '/app/swap', label: 'Swap', icon: ArrowLeftRight },
  { href: '/app/activity', label: 'Activity', icon: History },
  { href: '/app/wif', label: '$WIF', icon: Sparkles },
  { href: '/app/defi', label: 'DeFi', icon: Landmark },
  { href: '/app/security', label: 'Security', icon: ShieldCheck },
  { href: '/app/hardware', label: 'Hardware', icon: Cpu },
  { href: '/app/wallets', label: 'Wallets', icon: Wallet },
  { href: '/app/settings', label: 'Settings', icon: Settings },
]

function NetworkStatus() {
  const { state, update } = useWallet()
  const v = useVerification()
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Network"
        className="rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs font-semibold outline-none"
        value={state.network}
        onChange={(e) => update((s) => ({ ...s, network: e.target.value as typeof s.network }))}
      >
        {SELECTABLE_NETWORKS.map((k) => (
          <option key={k} value={k}>
            {NETWORKS[k].name}
          </option>
        ))}
      </select>
      {v.isLoading ? (
        <Badge>checking…</Badge>
      ) : v.data?.ok ? (
        <Badge tone="ok" >
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> chain {v.data.chainId} · #{v.data.blockNumber.toString()}
        </Badge>
      ) : (
        <Badge tone="bad">unverified</Badge>
      )}
    </div>
  )
}

function Bellbox() {
  const n = useNotify()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        className="relative rounded-lg border border-white/10 p-2 hover:bg-white/5"
        aria-label="Notifications"
        onClick={() => {
          setOpen(!open)
          if (!open) n.markAllRead()
        }}
      >
        <Bell className="h-4 w-4" />
        {n.unread > 0 && <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-lime px-1 text-[10px] font-bold text-ink-950">{n.unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-80 p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            <button className="text-xs text-mute hover:text-white" onClick={n.clear}>
              Clear
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {n.items.length === 0 && <p className="px-2 py-6 text-center text-sm text-mute">Nothing yet.</p>}
            {n.items.map((i) => (
              <a key={i.id} href={i.href} target={i.href ? '_blank' : undefined} rel="noreferrer" className="block rounded-lg px-2 py-2 hover:bg-white/5">
                <p className="text-sm font-medium">{i.title}</p>
                {i.body && <p className="truncate text-xs text-mute">{i.body}</p>}
                <p className="text-[10px] text-mute">{timeAgo(new Date(i.at).toISOString())}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WalletSwitcher() {
  const { state, activeWallet, activeAccount, setActive } = useWallet()
  return (
    <select
      aria-label="Active account"
      className="max-w-[220px] rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs font-semibold outline-none"
      value={`${activeWallet?.id}:${activeAccount?.index}`}
      onChange={(e) => {
        const [id, idx] = e.target.value.split(':')
        setActive(id!, Number(idx))
      }}
    >
      {state.wallets
        .filter((w) => !w.archived)
        .flatMap((w) =>
          w.accounts.map((a) => (
            <option key={`${w.id}:${a.index}`} value={`${w.id}:${a.index}`}>
              {w.name} · {a.label} · {shortAddress(a.address)}
            </option>
          )),
        )}
    </select>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { lock, unlocked } = useWallet()
  const [mobileNav, setMobileNav] = useState(false)

  const nav = (
    <nav className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileNav(false)}
            className={cx(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              active ? 'bg-lime/10 text-lime' : 'text-mute hover:bg-white/[0.04] hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-ink-950">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/60 p-4 lg:flex">
        <Link href="/" className="mb-8 px-2">
          <Logo />
        </Link>
        {nav}
        <div className="mt-auto rounded-xl border border-lime/20 bg-lime/[0.05] p-3 text-xs text-lime-soft">
          InWIF is free. No subscriptions, no paywalls, no InWIF fees.
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setMobileNav(false)}>
          <div className="h-full w-64 bg-ink-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button onClick={() => setMobileNav(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <NetworkStatus />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <WalletSwitcher />
            </div>
            <Bellbox />
            {unlocked.size > 0 && (
              <button className="rounded-lg border border-white/10 p-2 hover:bg-white/5" onClick={lock} aria-label="Lock wallet" title="Lock now">
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
      <DevicePanel />
    </div>
  )
}
