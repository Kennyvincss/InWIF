'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAddress, type Address } from 'viem'
import { AppWindow, Cpu, KeyRound, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { checkRecipient, explorerAddressUrl, findApprovals, revokeCalldata, shortAddress } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useActivity, useNetwork, useTokens, useVerification } from '@/lib/hooks'
import { useHardware } from '@/lib/hardware'
import { useNotify } from '@/lib/notifications'
import { fmtToken } from '@/lib/format'
import { ActivityList } from '@/components/ActivityList'
import { TxFlow, type TxRequest } from '@/components/TxFlow'
import { Badge, Empty, ErrorBox, Notice, PageHeader, Row, Skeleton } from '@/components/ui'

export default function SecurityPage() {
  const { activeAccount, activeWallet, state, update } = useWallet()
  const { network, client } = useNetwork()
  const verification = useVerification()
  const tokens = useTokens()
  const activity = useActivity(activeAccount?.address)
  const hw = useHardware()
  const notify = useNotify()
  const [req, setReq] = useState<TxRequest | null>(null)
  const [flag, setFlag] = useState('')

  // Scan known tokens plus any token this address has interacted with.
  const scanTokens = useMemo(() => {
    const set = new Map<string, Address>()
    tokens.forEach((t) => set.set(t.address.toLowerCase(), t.address))
    activity.data?.forEach((a) => a.tokenAddress && set.set(a.tokenAddress.toLowerCase(), a.tokenAddress))
    return [...set.values()]
  }, [tokens, activity.data])
  const symbols = useMemo(() => {
    const m: Record<string, { symbol: string; decimals: number }> = {}
    tokens.forEach((t) => (m[t.address.toLowerCase()] = { symbol: t.symbol, decimals: t.decimals }))
    activity.data?.forEach((a) => a.tokenAddress && (m[a.tokenAddress.toLowerCase()] ??= { symbol: a.symbol, decimals: a.decimals }))
    return m
  }, [tokens, activity.data])

  const approvals = useQuery({
    queryKey: ['approvals', network.key, activeAccount?.address, scanTokens.join(',')],
    enabled: !!activeAccount && scanTokens.length > 0,
    queryFn: async () => {
      const r = await findApprovals(client, activeAccount!.address, scanTokens)
      const unlimited = r.approvals.filter((a) => a.unlimited).length
      if (unlimited) notify.push({ type: 'security', title: `${unlimited} unlimited token approval(s) found`, body: 'Review them in the Security Centre.' })
      return r
    },
    staleTime: 120_000,
  })

  const known: Record<string, string> = {}
  if (network.uniswapV3) known[network.uniswapV3.swapRouter02.toLowerCase()] = 'Uniswap V3 SwapRouter02'

  const flagCheck = flag ? checkRecipient(flag) : null
  const score = [
    verification.data?.ok,
    activeWallet?.backedUp,
    state.settings.autoLockMinutes <= 15,
    approvals.data ? approvals.data.approvals.every((a) => !a.unlimited) : undefined,
    activeWallet?.kind === 'hardware',
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Security Centre" subtitle="Every security feature in InWIF is free." />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card p-5">
          <p className="text-sm text-mute">Network</p>
          {verification.data?.ok ? (
            <p className="mt-1 flex items-center gap-2 font-semibold text-ok">
              <ShieldCheck className="h-5 w-5" /> {network.name} verified
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-2 font-semibold text-bad">
              <ShieldAlert className="h-5 w-5" /> Not verified
            </p>
          )}
          <p className="mt-1 text-xs text-mute">{verification.data?.ok ? `RPC chain ID ${verification.data.chainId} matches config.` : verification.data?.reason}</p>
        </section>
        <section className="card p-5">
          <p className="text-sm text-mute">Security checklist</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {score.filter(Boolean).length}/{score.length}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-mute">
            <li>{verification.data?.ok ? '✓' : '○'} Network verified</li>
            <li>{activeWallet?.backedUp ? '✓' : '○'} Recovery phrase verified</li>
            <li>{state.settings.autoLockMinutes <= 15 ? '✓' : '○'} Auto-lock ≤ 15 min</li>
            <li>{score[3] ? '✓' : '○'} No unlimited approvals</li>
            <li>{activeWallet?.kind === 'hardware' ? '✓' : '○'} Hardware signing</li>
          </ul>
        </section>
        <section className="card p-5">
          <p className="text-sm text-mute">Connected devices</p>
          {hw.info ? (
            <>
              <p className="mt-1 flex items-center gap-2 font-semibold">
                <Cpu className="h-4 w-4 text-lime" /> {state.deviceNames[hw.info.serial] ?? hw.info.model}
              </p>
              <p className="text-xs text-mute">
                Firmware {hw.info.firmware} · {hw.authenticity ? (hw.authenticity.production ? 'genuine' : 'development device') : 'authenticity not checked'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm">None connected</p>
          )}
          <Link href="/app/hardware" className="mt-2 inline-block text-xs text-lime">
            Manage devices →
          </Link>
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display font-bold">
            <KeyRound className="h-5 w-5 text-lime" /> Token approvals
          </h2>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => approvals.refetch()}>
            Rescan
          </button>
        </div>
        <p className="mb-3 text-xs text-mute">
          Live allowances found from on-chain Approval events for {scanTokens.length} token(s) you hold or have used. An approval lets a contract move your tokens without asking
          again.
        </p>
        {approvals.isLoading ? (
          <Skeleton className="h-20" />
        ) : approvals.isError ? (
          <ErrorBox>{(approvals.error as Error).message}</ErrorBox>
        ) : !approvals.data?.approvals.length ? (
          <Empty icon={<ShieldCheck className="h-5 w-5" />} title="No live approvals found">
            This does not prove no approvals exist for tokens InWIF did not scan.
          </Empty>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {approvals.data.approvals.map((a) => {
              const t = symbols[a.token.toLowerCase()]
              return (
                <li key={a.token + a.spender} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {t?.symbol ?? shortAddress(a.token)} → {known[a.spender.toLowerCase()] ?? shortAddress(a.spender)}
                    </p>
                    <a className="font-mono text-xs text-mute hover:text-white" href={explorerAddressUrl(network, a.spender)} target="_blank" rel="noreferrer">
                      {a.spender}
                    </a>
                  </div>
                  {a.unlimited ? <Badge tone="bad">Unlimited</Badge> : <Badge>{t ? fmtToken(a.allowance, t.decimals) : a.allowance.toString()}</Badge>}
                  <button
                    className="btn-danger px-3 py-1.5 text-xs"
                    onClick={() => setReq({ to: a.token, data: revokeCalldata(a.spender), summary: `Revoke ${t?.symbol ?? 'token'} approval`, kind: 'revoke' })}
                  >
                    Revoke
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {approvals.data?.errors.length ? <p className="mt-2 text-xs text-warn">Some tokens could not be scanned: the RPC limited the log query.</p> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-display font-bold">Flagged addresses</h2>
          <p className="mb-3 text-xs text-mute">
            Your personal blocklist. InWIF blocks sends and warns on approvals involving these addresses. An address not being flagged does not mean it is safe.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!flagCheck?.address) return
              update((s) => ({ ...s, blocklist: [...new Set([...s.blocklist, flagCheck.address!.toLowerCase()])] }))
              setFlag('')
            }}
          >
            <input className="input font-mono" placeholder="0x… address to flag" value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="Address to flag" />
            <button className="btn-ghost" disabled={!flagCheck?.address}>
              Flag
            </button>
          </form>
          <ul className="mt-3 space-y-1">
            {state.blocklist.map((a) => (
              <li key={a} className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs">
                {getAddress(a)}
                <button aria-label="Remove" className="text-mute hover:text-bad" onClick={() => update((s) => ({ ...s, blocklist: s.blocklist.filter((x) => x !== a) }))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
            <AppWindow className="h-5 w-5 text-lime" /> Connected applications
          </h2>
          <Notice>InWIF does not connect to other websites or apps. Your wallet lives only in InWIF, and nothing outside it can request signatures.</Notice>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Settings</h3>
          <Row label="Auto-lock">{state.settings.autoLockMinutes} minutes</Row>
          <Row label="Key storage">AES-256-GCM, per-wallet, this device only</Row>
          <Row label="Transaction simulation">Before every signature</Row>
          <Link href="/app/settings" className="mt-2 inline-block text-xs text-lime">
            Change security settings →
          </Link>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-2 font-display font-bold">Recent wallet activity</h2>
        <ActivityList items={activity.data} loading={activity.isLoading} error={activity.error as Error | null} limit={8} />
      </section>

      <TxFlow request={req} onClose={() => setReq(null)} onDone={() => void approvals.refetch()} />
    </div>
  )
}

