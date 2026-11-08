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
  Radio,
  ScanSearch,
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
import { AddressAvatar, Badge, cx } from './ui'
import { UsernameText } from './Username'
import { useWallet } from '@/lib/wallet-store'
import { useVerification } from '@/lib/hooks'
import { useNotify } from '@/lib/notifications'
import { SELECTABLE_NETWORKS } from '@/lib/net'
import { DevicePanel } from './DevicePanel'
import { InstallButton } from './InstallButton'
import { timeAgo } from '@/lib/format'

const NAV_GROUPS = [
  {
    label: 'Wallet',
    items: [
      { href: '/app', label: 'Portfolio', icon: LayoutDashboard },
      { href: '/app/send', label: 'Send', icon: ArrowUpRight },
      { href: '/app/receive', label: 'Receive', icon: ArrowDownLeft },
      { href: '/app/swap', label: 'Swap', icon: ArrowLeftRight },
      { href: '/app/activity', label: 'Activity', icon: History },
    ],
  },
  {
    label: 'Markets',
    items: [
      { href: '/app/wif', label: '$WIF', icon: Sparkles },
      { href: '/app/wif/live', label: 'Live $WIF', icon: Radio },
      { href: '/app/check', label: 'Token check', icon: ScanSearch },
      { href: '/app/defi', label: 'DeFi', icon: Landmark },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/app/security', label: 'Security', icon: ShieldCheck },
      { href: '/app/hardware', label: 'Hardware', icon: Cpu },
      { href: '/app/wallets', label: 'Wallets', icon: Wallet },
      { href: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
]
const NAV = NAV_GROUPS.flatMap((g) => g.items)

function NetworkStatus() {
  const { state, update } = useWallet()
  const v = useVerification()
  return (
    <div className="flex items-center gap-2">
      <span className="relative inline-flex items-center">
        <span className={cx('pointer-events-none absolute left-3 h-1.5 w-1.5 rounded-full', v.data?.ok ? 'bg-accent shadow-[0_0_8px_rgba(0,229,155,.9)]' : 'bg-dim')} />
      <select
        aria-label="Network"
        className="max-w-[8rem] cursor-pointer appearance-none truncate rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-7 pr-3 text-xs font-medium outline-none transition hover:border-white/[0.16] min-[381px]:max-w-[9.5rem] sm:max-w-none"
        value={state.network}
        onChange={(e) => update((s) => ({ ...s, network: e.target.value as typeof s.network }))}
      >
        {SELECTABLE_NETWORKS.map((k) => (
          <option key={k} value={k}>
            {NETWORKS[k].name}
          </option>
        ))}
      </select>
      </span>
      {/* Only speak up when something is wrong: signing is disabled until the network checks out. */}
      {!v.isLoading && !v.data?.ok && <Badge tone="bad">Network issue</Badge>}
    </div>
  )
}

function Bellbox() {
  const n = useNotify()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        className="relative rounded-full border border-white/[0.08] bg-white/[0.03] p-2 transition hover:border-white/[0.16] hover:bg-white/[0.06]"
        aria-label="Notifications"
        onClick={() => {
          setOpen(!open)
          if (!open) n.markAllRead()
        }}
      >
        <Bell className="h-4 w-4" />
        {n.unread > 0 && <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-accent px-1 text-[10px] font-bold text-black shadow-[0_0_10px_rgba(0,229,155,.8)]">{n.unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-80 bg-[#08080A]/95 p-2">
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
      className="max-w-[240px] cursor-pointer truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium outline-none transition hover:border-white/[0.16]"
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
  const { lock, unlocked, activeWallet, activeAccount } = useWallet()
  const [mobileNav, setMobileNav] = useState(false)
  // The most specific matching item is active (so /app/wif/live does not also light up $WIF).
  const activeHref = NAV.map((n) => n.href)
    .filter((h) => (h === '/app' ? path === '/app' : path === h || path.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (href: string) => href === activeHref
  const current = NAV.find((n) => isActive(n.href))

  const nav = (
    <nav className="space-y-6">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">{g.label}</p>
          <div className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileNav(false)}
                  className={cx(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition',
                    active ? 'bg-white/[0.06] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.07)]' : 'text-mute hover:bg-white/[0.03] hover:text-white',
                  )}
                >
                  {active && <span className="absolute -left-4 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_rgba(0,229,155,.9)]" />}
                  <Icon className={cx('h-[17px] w-[17px] transition', active ? 'text-accent' : 'text-dim group-hover:text-white')} />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  const account = activeAccount && (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
      <AddressAvatar address={activeAccount.address} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{activeWallet?.name}</p>
        <p className="truncate font-mono text-[11px] text-dim">
          <UsernameText address={activeAccount.address} className="mr-1.5 text-accent" />
          {shortAddress(activeAccount.address)}
        </p>
      </div>
      <span className="live-dot" title="Connected" />
    </div>
  )

  return (
    <div className="ambient flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-black/50 px-4 py-5 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-9 px-3">
          <Logo />
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-6 space-y-3">
          {account}
          <p className="px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-dim">Free forever · 0% fees</p>
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)}>
          <div className="flex h-full w-72 flex-col border-r border-line bg-black px-4 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-8 flex items-center justify-between px-3">
              <Logo />
              <button className="rounded-full border border-white/[0.08] p-1.5" onClick={() => setMobileNav(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
            <div className="mt-6">{account}</div>
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-black/60 px-3 py-3 backdrop-blur-xl sm:px-6">
          <button className="rounded-full border border-white/[0.08] p-2 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>
          <p className="mr-2 hidden font-mono text-[11px] uppercase tracking-[0.18em] text-dim lg:block">{current?.label ?? 'Wallet'}</p>
          <NetworkStatus />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:block">
              <WalletSwitcher />
            </div>
            <InstallButton compact />
            <Bellbox />
            {unlocked.size > 0 && (
              <button className="rounded-full border border-white/[0.08] bg-white/[0.03] p-2 transition hover:border-white/[0.16] hover:bg-white/[0.06]" onClick={lock} aria-label="Lock wallet" title="Lock now">
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
      <DevicePanel />
    </div>
  )
}
