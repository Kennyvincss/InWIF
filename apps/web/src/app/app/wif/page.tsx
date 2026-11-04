'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { encodeFunctionData, getAddress, type Hex } from 'viem'
import { BadgeCheck, ExternalLink, Gift, GraduationCap, Sparkles } from 'lucide-react'
import {
  SECURITY_QUESTS,
  WIF_ADDRESS,
  compareMetadata,
  DEFAULT_TOKENS,
  explorerAddressUrl,
  explorerTokenUrl,
  fetchExplorerToken,
  inwifRewardsAbi,
  readTokenMetadata,
  rewardsContractAddress,
  type ChartRange,
} from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { fetchHistory, useActivity, useNetwork, usePortfolio, useTokenMarket } from '@/lib/hooks'
import { fmtPct, fmtToken, fmtUsd } from '@/lib/format'
import { ECOSYSTEM_APPS, LISTING_CRITERIA } from '@/lib/ecosystem'
import { AreaChart } from '@/components/Charts'
import { ActivityList } from '@/components/ActivityList'
import { TxFlow, type TxRequest } from '@/components/TxFlow'
import { Badge, CopyButton, ErrorBox, Notice, PageHeader, Row, Skeleton, cx } from '@/components/ui'

const WIF_LISTING = DEFAULT_TOKENS.robinhood.find((t) => t.isWif)!

export default function WifPage() {
  const { activeAccount, state, update } = useWallet()
  const { network, client } = useNetwork()
  const onMainnet = network.key === 'robinhood'
  const address = activeAccount?.address
  const { rows } = usePortfolio(address)
  const wifRow = rows.find((r) => r.token?.isWif)
  const [range, setRange] = useState<ChartRange>('30d')

  const meta = useQuery({
    queryKey: ['wif-meta', network.key],
    enabled: onMainnet,
    queryFn: async () => {
      const m = await readTokenMetadata(client, WIF_ADDRESS)
      return { meta: m, check: compareMetadata(WIF_LISTING, m) }
    },
    staleTime: 3_600_000,
  })
  const explorer = useQuery({ queryKey: ['wif-explorer'], enabled: onMainnet, queryFn: () => fetchExplorerToken(network, WIF_ADDRESS), retry: 1 })
  const market = useTokenMarket(network, onMainnet ? WIF_ADDRESS : undefined)
  const history = useQuery({ queryKey: ['wif-history', range], enabled: onMainnet, queryFn: () => fetchHistory(network, WIF_ADDRESS, range), staleTime: 300_000 })
  const transfers = useActivity(onMainnet ? address : undefined, WIF_ADDRESS)

  const participation = transfers.data
    ? {
        count: transfers.data.length,
        first: transfers.data[transfers.data.length - 1]?.timestamp,
        received: transfers.data.filter((t) => t.direction === 'in').length,
        sent: transfers.data.filter((t) => t.direction === 'out').length,
      }
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="$WIF Ecosystem"
        subtitle="World Is Flat on Robinhood Chain. Optional, always — no InWIF feature ever requires holding or spending $WIF."
        actions={
          <>
            <Link href="/app/swap" className="btn-primary">Get $WIF</Link>
            <Link href="/app/send" className="btn-ghost">Send $WIF</Link>
          </>
        }
      />

      {!onMainnet && <Notice tone="warn">$WIF lives on Robinhood Chain mainnet. Switch network in the top bar to see live data.</Notice>}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-mute">Your $WIF balance</p>
              <p className="mt-1 font-display text-4xl font-extrabold">{wifRow ? fmtToken(wifRow.raw, wifRow.decimals, 2) : '—'} <span className="text-lime">WIF</span></p>
              <p className="text-sm text-mute">{fmtUsd(wifRow?.valueUsd)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-mute">Price</p>
              <p className="font-display text-2xl font-bold">{market.isLoading ? <Skeleton className="h-7 w-24" /> : fmtUsd(market.data?.priceUsd)}</p>
              <p className={cx('text-sm', (market.data?.change24hPct ?? 0) >= 0 ? 'text-ok' : 'text-bad')}>{fmtPct(market.data?.change24hPct)} 24h</p>
            </div>
          </div>
          <div className="mt-4 flex gap-1">
            {(['24h', '7d', '30d', '90d', 'all'] as ChartRange[]).map((r) => (
              <button key={r} className={cx('chip', range === r && 'border-lime/40 text-lime')} onClick={() => setRange(r)}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {history.isLoading ? <Skeleton className="h-48" /> : history.data && history.data.length > 1 ? <AreaChart data={history.data} label="$WIF price (USD)" /> : <Notice>No price history available from GeckoTerminal.</Notice>}
          </div>
          <p className="mt-2 text-xs text-mute">Market data: GeckoTerminal (on-chain DEX pools). Prices of low-liquidity tokens can move sharply.</p>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 font-display font-bold">
            Token information
            {meta.data?.check.matches && (
              <Badge tone="ok">
                <BadgeCheck className="h-3 w-3" /> verified on-chain
              </Badge>
            )}
          </h2>
          {meta.isError && <ErrorBox>Could not read the contract: {(meta.error as Error).message}</ErrorBox>}
          {meta.data && !meta.data.check.matches && <ErrorBox>{meta.data.check.issues.join(' ')}</ErrorBox>}
          <Row label="Name">{meta.data?.meta.name ?? '…'}</Row>
          <Row label="Symbol">{meta.data?.meta.symbol ?? '…'}</Row>
          <Row label="Decimals">{meta.data?.meta.decimals ?? '…'}</Row>
          <Row label="Total supply">{meta.data ? fmtToken(meta.data.meta.totalSupply, meta.data.meta.decimals, 0) : '…'}</Row>
          <Row label="Holders">{explorer.data?.holders ? Number(explorer.data.holders).toLocaleString() : '—'}</Row>
          <Row label="Liquidity">{fmtUsd(market.data?.liquidityUsd, { compact: true })}</Row>
          <Row label="24h volume">{fmtUsd(market.data?.volume24hUsd, { compact: true })}</Row>
          <Row label="FDV">{fmtUsd(market.data?.fdvUsd, { compact: true })}</Row>
          <div className="mt-3 rounded-xl bg-ink-900 p-3">
            <p className="label">Contract</p>
            <p className="break-all font-mono text-xs">{WIF_ADDRESS}</p>
            <div className="mt-2 flex gap-2">
              <CopyButton value={WIF_ADDRESS} />
              <a className="btn-ghost px-3 py-1.5 text-xs" href={explorerTokenUrl(network, WIF_ADDRESS)} target="_blank" rel="noreferrer">
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </section>
      </div>

      <section className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-lime/10 blur-3xl" />
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Sparkles className="h-5 w-5 text-lime" /> Powered by the World Is Flat Ecosystem
        </h2>
        <div className="mt-3 grid gap-4 text-sm text-mute md:grid-cols-3">
          <p>
            <span className="font-semibold text-white">InWIF is a free gateway.</span> It gives every World Is Flat community member a secure, self-custody home for $WIF on Robinhood
            Chain — with hardware-grade signing on the way.
          </p>
          <p>
            <span className="font-semibold text-white">$WIF is the ecosystem token, not a toll.</span> Holding $WIF unlocks nothing extra in InWIF: every wallet, security and
            portfolio feature is identical for every user.
          </p>
          <p>
            <span className="font-semibold text-white">Utility is real and on-chain.</span> Track $WIF, trade it via Uniswap, audit its approvals, take part in funded reward
            campaigns, and discover reviewed apps built around it.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-display font-bold">Your ecosystem profile</h2>
          <Row label="Address">
            <a className="font-mono text-xs hover:text-lime" href={address && explorerAddressUrl(network, address)} target="_blank" rel="noreferrer">
              {address}
            </a>
          </Row>
          <Row label="$WIF balance">{wifRow ? `${fmtToken(wifRow.raw, wifRow.decimals, 2)} WIF` : '—'}</Row>
          <Row label="$WIF transfers">{participation ? `${participation.count} (${participation.received} in · ${participation.sent} out)` : '—'}</Row>
          <Row label="First $WIF activity">{participation?.first ? new Date(participation.first).toLocaleDateString() : '—'}</Row>
          <Row label="Security quests">{Object.keys(state.quests).length} / {SECURITY_QUESTS.length}</Row>
          <p className="mt-3 text-xs text-mute">Built only from public on-chain data and your local quest progress. Nothing is uploaded.</p>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
            <GraduationCap className="h-5 w-5 text-lime" /> Security quests
          </h2>
          <p className="mb-3 text-xs text-mute">Free learning tasks. Completing them is tracked on this device only and does not by itself earn tokens.</p>
          <ul className="space-y-2">
            {SECURITY_QUESTS.map((q) => {
              const done = !!state.quests[q.id]
              return (
                <li key={q.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] p-3">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#A6F36A]"
                    checked={done}
                    aria-label={q.title}
                    onChange={() =>
                      update((s) => {
                        const quests = { ...s.quests }
                        if (done) delete quests[q.id]
                        else quests[q.id] = Date.now()
                        return { ...s, quests }
                      })
                    }
                  />
                  <div>
                    <p className={cx('text-sm font-medium', done && 'text-mute line-through')}>{q.title}</p>
                    <p className="text-xs text-mute">{q.body}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <Rewards />

      <section className="card p-5">
        <h2 className="mb-2 font-display font-bold">Your $WIF transfer history</h2>
        <ActivityList items={transfers.data} loading={transfers.isLoading} error={transfers.error as Error | null} emptyText="No $WIF transfers for this address yet." />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display font-bold">Ecosystem applications</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {ECOSYSTEM_APPS.map((a) => (
            <Link key={a.id} href={a.href} className="rounded-xl border border-white/[0.06] p-4 hover:border-lime/30">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{a.name}</p>
                <Badge tone={a.status === 'live' ? 'ok' : 'warn'}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-mute">{a.description}</p>
            </Link>
          ))}
        </div>
        <details className="mt-4 text-sm text-mute">
          <summary className="cursor-pointer">How third-party $WIF apps get listed</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {LISTING_CRITERIA.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}

interface ClaimFile {
  claims: Record<string, { amount: string; proof: Hex[] }>
}

function Rewards() {
  const { activeAccount } = useWallet()
  const { network, client } = useNetwork()
  const contract = rewardsContractAddress(network.chainId)
  const [req, setReq] = useState<TxRequest | null>(null)
  const campaigns = useQuery({
    queryKey: ['campaigns', network.key, contract, activeAccount?.address],
    enabled: !!contract && !!activeAccount,
    queryFn: async () => {
      const n = await client.readContract({ address: contract!, abi: inwifRewardsAbi, functionName: 'campaignCount' })
      const ids = Array.from({ length: Number(n) }, (_, i) => BigInt(i + 1))
      return Promise.all(
        ids.map(async (id) => {
          const [token, root, funded, claimed, deadline, active, uri] = await client.readContract({ address: contract!, abi: inwifRewardsAbi, functionName: 'campaigns', args: [id] })
          const has = await client.readContract({ address: contract!, abi: inwifRewardsAbi, functionName: 'hasClaimed', args: [id, activeAccount!.address] })
          let mine: { amount: bigint; proof: Hex[] } | null = null
          if (/^https:\/\//.test(uri)) {
            try {
              const f = (await (await fetch(uri)).json()) as ClaimFile
              const c = f.claims[getAddress(activeAccount!.address)] ?? f.claims[activeAccount!.address.toLowerCase()]
              if (c) mine = { amount: BigInt(c.amount), proof: c.proof }
            } catch {
              /* distribution file unavailable */
            }
          }
          return { id, token, root, funded, claimed, deadline, active, uri, has, mine }
        }),
      )
    },
  })

  return (
    <section id="rewards" className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
        <Gift className="h-5 w-5 text-lime" /> Ecosystem rewards
      </h2>
      <p className="mb-3 text-xs text-mute">
        Rewards are optional and paid only from tokens already deposited into the InWIFRewards contract for each campaign — every deposit and claim is public on-chain. No
        returns are promised.
      </p>
      {!contract ? (
        <Notice>
          No rewards contract is deployed on {network.name}. The InWIFRewards contract is written and tested but unaudited, so InWIF does not deploy it to mainnet. Developers
          can deploy it to testnet with <code className="text-white">contracts/script/DeployRewards.s.sol</code>.
        </Notice>
      ) : campaigns.isLoading ? (
        <Skeleton className="h-24" />
      ) : campaigns.isError ? (
        <ErrorBox>{(campaigns.error as Error).message}</ErrorBox>
      ) : !campaigns.data?.length ? (
        <Notice>No campaigns have been created yet.</Notice>
      ) : (
        <ul className="space-y-2">
          {campaigns.data.map((c) => (
            <li key={c.id.toString()} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] p-3 text-sm">
              <div className="flex-1">
                <p className="font-medium">Campaign #{c.id.toString()}</p>
                <p className="text-xs text-mute">
                  Funded {fmtToken(c.funded, 18)} · claimed {fmtToken(c.claimed, 18)} · ends {new Date(Number(c.deadline) * 1000).toLocaleDateString()}
                </p>
              </div>
              {c.has ? (
                <Badge tone="ok">Claimed</Badge>
              ) : c.mine ? (
                <button
                  className="btn-primary"
                  onClick={() =>
                    setReq({
                      to: contract,
                      data: encodeFunctionData({ abi: inwifRewardsAbi, functionName: 'claim', args: [c.id, c.mine!.amount, c.mine!.proof] }),
                      summary: `Claim reward from campaign #${c.id}`,
                      kind: 'claim',
                    })
                  }
                >
                  Claim {fmtToken(c.mine.amount, 18)}
                </button>
              ) : (
                <Badge>Not eligible</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <TxFlow request={req} onClose={() => setReq(null)} onDone={() => void campaigns.refetch()} />
    </section>
  )
}
