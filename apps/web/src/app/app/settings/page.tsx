'use client'
import { useState } from 'react'
import { BellRing, Coins, Network, ShieldCheck, Trash2, Smartphone } from 'lucide-react'
import { NETWORKS, normaliseTokenAddress, readTokenMetadata, INWIF_POLICY } from '@inwif/core'
import { InstallButton } from '@/components/InstallButton'
import { MyUsernameCard } from '@/components/Username'
import { useWallet, type Settings } from '@/lib/wallet-store'
import { useNetwork, useTokens } from '@/lib/hooks'
import { SELECTABLE_NETWORKS } from '@/lib/net'
import { ErrorBox, PageHeader, Row, Spinner } from '@/components/ui'

const NOTIFY_LABELS: Record<keyof Settings['notifications'], string> = {
  incoming: 'Incoming transactions',
  outgoing: 'Outgoing transactions',
  failed: 'Failed transactions',
  swaps: 'Completed swaps',
  hardware: 'Hardware connections',
  firmware: 'Firmware updates',
  security: 'Security alerts',
  browser: 'Also show system notifications',
}

export default function SettingsPage() {
  const { state, update, resetAll } = useWallet()
  const { network, client } = useNetwork()
  const tokens = useTokens()
  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (patch: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))

  async function addToken() {
    setErr(null)
    const addr = normaliseTokenAddress(tokenInput)
    if (!addr) return setErr('Enter a valid token contract address.')
    if (tokens.some((t) => t.address === addr)) return setErr('Token already listed.')
    setBusy(true)
    try {
      const m = await readTokenMetadata(client, addr)
      update((s) => ({
        ...s,
        customTokens: {
          ...s.customTokens,
          [s.network]: [...(s.customTokens[s.network] ?? []), { address: addr, symbol: m.symbol.slice(0, 12), name: m.name.slice(0, 40), decimals: m.decimals, source: 'Added by you (metadata read on-chain)' }],
        },
      }))
      setTokenInput('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />

      <MyUsernameCard />

      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display font-bold"><Smartphone className="h-5 w-5 text-accent" /> Install InWIF</h2>
        <p className="mb-4 text-sm text-mute">Add InWIF to your home screen or desktop. It opens full-screen like an app, with shortcuts to Send, Receive, Swap and Live $WIF.</p>
        <InstallButton />
        <p className="mt-3 text-xs text-dim">Don&apos;t see a button? Use your browser&apos;s menu and choose &ldquo;Install app&rdquo; or &ldquo;Add to Home Screen&rdquo;. Already installed? You&apos;re all set.</p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><Network className="h-5 w-5 text-accent" /> Network</h2>
        <select className="input" value={state.network} onChange={(e) => update((s) => ({ ...s, network: e.target.value as typeof s.network }))} aria-label="Network">
          {SELECTABLE_NETWORKS.map((k) => (
            <option key={k} value={k}>{NETWORKS[k].name}</option>
          ))}
        </select>
        <div className="mt-3">
          <Row label="Chain ID">{network.chainId}</Row>
          <Row label="Native currency">{network.nativeCurrency.symbol}</Row>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><ShieldCheck className="h-5 w-5 text-accent" /> Security</h2>
        <label className="label" htmlFor="autolock">Auto-lock after inactivity</label>
        <select id="autolock" className="input" value={state.settings.autoLockMinutes} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) })}>
          {[1, 5, 15, 30, 60].map((m) => (
            <option key={m} value={m}>{m} minute{m > 1 ? 's' : ''}</option>
          ))}
        </select>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" className="accent-[#E8622C]" checked={state.settings.hideBalances} onChange={(e) => set({ hideBalances: e.target.checked })} />
          Hide balances by default
        </label>
        <label className="label mt-4" htmlFor="currency">Show balances in</label>
        <select id="currency" className="input" value={state.settings.displayCurrency ?? 'WIF'} onChange={(e) => set({ displayCurrency: e.target.value as 'WIF' | 'USD' })}>
          <option value="WIF">$WIF</option>
          <option value="USD">US dollars</option>
        </select>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><BellRing className="h-5 w-5 text-accent" /> Notifications</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(NOTIFY_LABELS) as (keyof Settings['notifications'])[]).map((k) => (
            <label key={k} className="flex items-center gap-3 rounded-lg border border-fg/[0.06] px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="accent-[#E8622C]"
                checked={state.settings.notifications[k]}
                onChange={async (e) => {
                  const on = e.target.checked
                  if (k === 'browser' && on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                    const p = await Notification.requestPermission()
                    if (p !== 'granted') return
                  }
                  set({ notifications: { ...state.settings.notifications, [k]: on } })
                }}
              />
              {NOTIFY_LABELS[k]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-mute">Notifications are generated on this device from public chain data. No push server receives your addresses.</p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><Coins className="h-5 w-5 text-accent" /> Tokens on {network.name}</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {tokens.map((t) => (
            <li key={t.address} className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2">
              <span><b>{t.symbol}</b> <span className="text-xs text-mute">{t.source}</span></span>
              {state.customTokens[state.network]?.some((c) => c.address === t.address) && (
                <button aria-label={`Remove ${t.symbol}`} className="text-mute hover:text-bad" onClick={() => update((s) => ({ ...s, customTokens: { ...s.customTokens, [s.network]: s.customTokens[s.network]!.filter((c) => c.address !== t.address) } }))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="input font-mono" placeholder="Token contract 0x…" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} aria-label="Custom token address" />
          <button className="btn-ghost" onClick={addToken} disabled={busy}>{busy ? <Spinner /> : 'Add'}</button>
        </div>
        {err && <div className="mt-2"><ErrorBox>{err}</ErrorBox></div>}
        <p className="mt-2 text-xs text-mute">Anyone can deploy a token with any name. Verify the contract address from an official source before adding.</p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display font-bold">About</h2>
        <Row label="Price">Free — every feature, every user</Row>
        <Row label="Subscriptions">{INWIF_POLICY.subscriptions ? 'Yes' : 'None, ever'}</Row>
        <Row label="InWIF service fee">{INWIF_POLICY.serviceFeeBps}%</Row>
        <Row label="$WIF required for features">No</Row>
        <Row label="Version">0.1.0 (pre-release, not audited)</Row>
      </section>

      <section className="card border-bad/30 p-5">
        <h2 className="mb-2 font-display font-bold text-bad">Danger zone</h2>
        <p className="mb-3 text-sm text-mute">Remove all wallets and settings from this browser. Make sure you have every recovery phrase first.</p>
        <button
          className="btn-danger"
          onClick={() => {
            if (confirm('Remove ALL wallets from this device? This cannot be undone.') && confirm('Have you backed up every recovery phrase and private key?')) resetAll()
          }}
        >
          Reset InWIF on this device
        </button>
      </section>
    </div>
  )
}
