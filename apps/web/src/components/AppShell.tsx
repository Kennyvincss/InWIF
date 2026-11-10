'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  HelpCircle,
  History,
  Landmark,
  LayoutDashboard,
  Lock,
  Menu,
  Radio,
  Route,
  ScanSearch,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NETWORKS, shortAddress } from '@inwif/core'
import { Logo } from './Logo'
import { AddressAvatar, Badge, cx } from './ui'
import { UsernameText } from './Username'
import { useWallet } from '@/lib/wallet-store'
import { useActivity, useVerification } from '@/lib/hooks'
import { useNotify } from '@/lib/notifications'
import { SELECTABLE_NETWORKS } from '@/lib/net'
import { DevicePanel } from './DevicePanel'
import { InstallButton } from './InstallButton'
import { timeAgo } from '@/lib/format'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  keywords?: string
}
interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Wallet',
    icon: Wallet,
    items: [
      { href: '/app', label: 'Portfolio', icon: LayoutDashboard, keywords: 'home dashboard balance' },
      { href: '/app/send', label: 'Send', icon: ArrowUpRight, keywords: 'pay transfer username' },
      { href: '/app/receive', label: 'Receive', icon: ArrowDownLeft, keywords: 'address qr request pay page' },
      { href: '/app/swap', label: 'Swap', icon: ArrowLeftRight, keywords: 'buy sell trade' },
      { href: '/app/activity', label: 'Activity', icon: History, keywords: 'history transactions' },
    ],
  },
  {
    label: 'Markets',
    icon: Sparkles,
    items: [
      { href: '/app/wif', label: '$WIF', icon: Sparkles, keywords: 'wif token price' },
      { href: '/app/wif/live', label: 'Live $WIF', icon: Radio, keywords: 'trades whale terminal' },
      { href: '/app/wif/journey', label: 'My $WIF journey', icon: Route, keywords: 'profit loss pnl average price badges' },
      { href: '/app/check', label: 'Token check', icon: ScanSearch, keywords: 'scam safety honeypot' },
      { href: '/app/defi', label: 'DeFi', icon: Landmark, keywords: 'liquidity staking' },
    ],
  },
  {
    label: 'Account',
    icon: ShieldCheck,
    items: [
      { href: '/app/security', label: 'Security', icon: ShieldCheck, keywords: 'approvals revoke backup' },
      { href: '/app/hardware', label: 'Hardware', icon: Cpu, keywords: 'device' },
      { href: '/app/wallets', label: 'Wallets', icon: Wallet, keywords: 'accounts import' },
    ],
  },
]
const FOOTER_NAV: NavItem[] = [
  { href: '/app/settings', label: 'Settings', icon: Settings, keywords: 'username network notifications install' },
  { href: '/docs#faq', label: 'Help & Support', icon: HelpCircle, keywords: 'faq docs' },
]
const NAV = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_NAV]

function useActiveHref() {
  const path = usePathname()
  // The most specific matching item is active (so /app/wif/live does not also light up $WIF).
  return NAV.map((n) => n.href)
    .filter((h) => (h === '/app' ? path === '/app' : path === h || path.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0]
}

/** Close a popover when clicking outside it or pressing Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const active = useActiveHref()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  return (
    <nav className="space-y-1.5">
      {NAV_GROUPS.map((g) => {
        const open = !collapsed[g.label]
        const hasActive = g.items.some((i) => i.href === active)
        return (
          <div key={g.label} className={cx('rounded-lg', open && 'bg-ink-900 pb-1.5')}>
            <button
              type="button"
              className={cx('flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-[15px] transition', hasActive || open ? 'text-[#ededed]' : 'text-mute hover:text-[#ededed]')}
              onClick={() => setCollapsed((c) => ({ ...c, [g.label]: open }))}
              aria-expanded={open}
            >
              <g.icon className="h-[19px] w-[19px] text-mute" />
              <span className="flex-1 text-left">{g.label}</span>
              <ChevronDown className={cx('h-4 w-4 text-mute transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="space-y-0.5 px-1.5">
                {g.items.map(({ href, label }) => {
                  const on = href === active
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      aria-current={on ? 'page' : undefined}
                      className={cx(
                        'block rounded-md py-2.5 pl-[3.1rem] pr-3 text-[14.5px] transition',
                        on ? 'bg-accent font-medium text-[#111]' : 'text-mute hover:bg-ink-600 hover:text-[#ededed]',
                      )}
                    >
                      {label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function SideFooter({ onNavigate }: { onNavigate?: () => void }) {
  const active = useActiveHref()
  return (
    <div className="space-y-0.5 border-t border-line pt-4">
      {FOOTER_NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cx(
            'flex items-center gap-3 rounded-md px-3.5 py-2.5 text-[15px] transition',
            href === active ? 'bg-accent font-medium text-[#111]' : 'text-mute hover:bg-ink-600 hover:text-[#ededed]',
          )}
        >
          <Icon className="h-[19px] w-[19px]" />
          {label}
        </Link>
      ))}
    </div>
  )
}

/** "Search or type a command": jump to any page by name or keyword. */
function CommandSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const ref = useDismiss(open, () => setOpen(false))
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return NAV.slice(0, 8)
    return NAV.filter((n) => `${n.label} ${n.keywords ?? ''}`.toLowerCase().includes(s)).slice(0, 8)
  }, [q])
  const go = (href: string) => {
    setOpen(false)
    setQ('')
    router.push(href)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref])
  return (
    <div ref={ref} className="relative w-full max-w-[460px]">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-mute" />
      <input
        className="h-11 w-full rounded-md border border-transparent bg-ink-700 pl-11 pr-3 text-[14.5px] text-[#ededed] outline-none transition placeholder:text-mute hover:border-ink-500 focus:border-accent/50"
        placeholder="Search or type a command"
        aria-label="Search or type a command"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setSel(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((v) => Math.min(results.length - 1, v + 1))
          else if (e.key === 'ArrowUp') setSel((v) => Math.max(0, v - 1))
          else if (e.key === 'Enter' && results[sel]) go(results[sel].href)
        }}
      />
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-lg border border-ink-500 bg-ink-700 p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-mute">No page matches &ldquo;{q}&rdquo;.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.href}
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => go(r.href)}
                className={cx('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm', i === sel ? 'bg-ink-500 text-[#ededed]' : 'text-mute')}
              >
                <r.icon className="h-4 w-4" />
                {r.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function NetworkStatus() {
  const { state, update } = useWallet()
  const v = useVerification()
  return (
    <div className="flex items-center gap-2">
      <span className="relative inline-flex items-center">
        <span className={cx('pointer-events-none absolute left-3 h-2 w-2 rounded-full', v.data?.ok ? 'bg-ok' : 'bg-dim')} />
        <select
          aria-label="Network"
          className="h-10 max-w-[8.5rem] cursor-pointer appearance-none truncate rounded-md border border-ink-500 bg-transparent pl-7 pr-3 text-[13px] font-medium text-[#ededed] outline-none transition hover:bg-ink-600 min-[381px]:max-w-[10rem] sm:max-w-none"
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

const iconBtn = 'relative grid h-10 w-10 place-items-center rounded-md text-[#d6d6d6] transition hover:bg-ink-600 hover:text-white'

function Bellbox() {
  const n = useNotify()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        className={cx(iconBtn, open && 'bg-ink-600')}
        aria-label="Notifications"
        onClick={() => {
          setOpen(!open)
          if (!open) n.markAllRead()
        }}
      >
        <Bell className="h-[19px] w-[19px]" />
        {n.unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-sm bg-sun px-1 text-[10px] font-bold text-[#1a1400]">{n.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-ink-500 bg-ink-700 p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            <button className="text-xs text-mute hover:text-white" onClick={n.clear}>
              Clear
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {n.items.length === 0 && <p className="px-2 py-6 text-center text-sm text-mute">Nothing yet.</p>}
            {n.items.map((i) => (
              <a key={i.id} href={i.href} target={i.href ? '_blank' : undefined} rel="noreferrer" className="block rounded-md px-2 py-2 hover:bg-ink-600">
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

/** Avatar + name in the top bar; opens a menu to switch account, copy the address or manage wallets. */
function AccountMenu() {
  const { state, activeWallet, activeAccount, setActive } = useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  if (!activeAccount) return null
  const accounts = state.wallets.filter((w) => !w.archived).flatMap((w) => w.accounts.map((a) => ({ w, a })))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition hover:bg-ink-600"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        data-testid="account-button"
      >
        <span className="rounded-full ring-2 ring-[#d6d3f7]/80 ring-offset-2 ring-offset-ink-800">
          <AddressAvatar address={activeAccount.address} size={34} />
        </span>
        <span className="hidden min-w-0 text-left xl:block">
          <span className="block max-w-[10rem] truncate text-[13px] font-medium">{activeWallet?.name}</span>
          <span className="block max-w-[10rem] truncate text-[11.5px] text-mute">
            <UsernameText address={activeAccount.address} className="mr-1 text-accent" />
            {shortAddress(activeAccount.address)}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-mute" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-[19rem] rounded-lg border border-ink-500 bg-ink-700 p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <AddressAvatar address={activeAccount.address} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{activeWallet?.name}</p>
              <p className="truncate font-mono text-xs text-mute">{shortAddress(activeAccount.address, 6)}</p>
            </div>
            <button
              type="button"
              className="rounded-md border border-ink-500 p-1.5 text-mute hover:bg-ink-600 hover:text-white"
              aria-label="Copy address"
              onClick={() => {
                navigator.clipboard?.writeText(activeAccount.address)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          {copied && <p className="px-2.5 pb-1 text-xs text-ok">Address copied</p>}
          {accounts.length > 1 && (
            <div className="border-t border-line pt-1.5">
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.04em] text-[#9095A4]">Switch account</p>
              <div className="max-h-56 overflow-y-auto">
                {accounts.map(({ w, a }) => {
                  const on = w.id === activeWallet?.id && a.index === activeAccount.index
                  return (
                    <button
                      key={`${w.id}:${a.index}`}
                      type="button"
                      onClick={() => {
                        setActive(w.id, a.index)
                        setOpen(false)
                      }}
                      className={cx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm', on ? 'bg-ink-500' : 'hover:bg-ink-600')}
                    >
                      <AddressAvatar address={a.address} size={22} />
                      <span className="min-w-0 flex-1 truncate">
                        {w.name} · {a.label}
                      </span>
                      <span className="font-mono text-[11px] text-mute">{shortAddress(a.address)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="mt-1.5 border-t border-line pt-1.5">
            <Link href="/app/wallets" onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-2 text-sm text-mute hover:bg-ink-600 hover:text-white">
              Manage wallets
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** "← Group › Page" on the left, "● Last activity …" (from the account's real history) on the right. */
function Breadcrumbs() {
  const router = useRouter()
  const active = useActiveHref()
  const { activeAccount } = useWallet()
  const activity = useActivity(activeAccount?.address)
  const item = NAV.find((n) => n.href === active)
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === active))
  const last = activity.data?.find((i) => i.timestamp)?.timestamp
  return (
    <div className="flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-8">
      <button type="button" aria-label="Back" className="-ml-1 rounded-md p-1 text-[#ededed] transition hover:bg-ink-600" onClick={() => router.back()}>
        <ArrowLeft className="h-5 w-5" />
      </button>
      <p className="flex min-w-0 items-center gap-2 text-[15px]">
        {group && (
          <>
            <span className="font-medium text-[#ededed]">{group.label}</span>
            <ChevronRight className="h-4 w-4 text-mute" />
          </>
        )}
        <span className="truncate text-mute">{item?.label ?? 'Wallet'}</span>
      </p>
      {last && (
        <p className="ml-auto flex items-center gap-2 text-[13.5px] text-mute">
          <span className="live-dot" />
          Last activity{' '}
          <span className="text-[#ededed]">
            {new Date(last).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </p>
      )}
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { lock, unlocked } = useWallet()
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="flex min-h-screen bg-ink-800">
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 flex-col border-r border-line bg-ink-700 px-4 pb-6 pt-7 lg:flex">
        <Link href="/" className="mb-10 px-3">
          <Logo />
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideNav />
        </div>
        <div className="mt-6">
          <SideFooter />
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setMobileNav(false)}>
          <div className="flex h-full w-[284px] flex-col border-r border-line bg-ink-700 px-4 pb-6 pt-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-8 flex items-center justify-between px-3">
              <Logo />
              <button className="rounded-md border border-ink-500 p-1.5" onClick={() => setMobileNav(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SideNav onNavigate={() => setMobileNav(false)} />
            </div>
            <div className="mt-6">
              <SideFooter onNavigate={() => setMobileNav(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-line bg-ink-800">
          <div className="flex h-[72px] items-center gap-2 px-3 sm:gap-3 sm:px-8">
            <button className={cx(iconBtn, 'lg:hidden')} onClick={() => setMobileNav(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden flex-1 md:block">
              <CommandSearch />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <NetworkStatus />
              <InstallButton compact />
              <Bellbox />
              {unlocked.size > 0 && (
                <button className={iconBtn} onClick={lock} aria-label="Lock wallet" title="Lock now">
                  <Lock className="h-[19px] w-[19px]" />
                </button>
              )}
              <span className="mx-1 hidden h-8 w-px bg-line sm:block" />
              <AccountMenu />
            </div>
          </div>
        </header>
        <Breadcrumbs />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
      <DevicePanel />
    </div>
  )
}
