'use client'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Layers, ShieldQuestion } from 'lucide-react'
import { explorerAddressUrl, fetchLpPositions } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useNetwork } from '@/lib/hooks'
import { fmtToken } from '@/lib/format'
import { Badge, Empty, ErrorBox, Notice, PageHeader, Skeleton } from '@/components/ui'

const CRITERIA = [
  'Contracts deployed and verified on Robinhood Chain',
  'Published independent audit',
  'Live, on-chain rate data (InWIF never displays estimated or marketing APYs)',
  'Transparent fee schedule that InWIF can show before you sign',
]

export default function DefiPage() {
  const { activeAccount } = useWallet()
  const { network, client } = useNetwork()
  const cfg = network.uniswapV3
  const positions = useQuery({
    queryKey: ['lp', network.key, activeAccount?.address],
    enabled: !!cfg && !!activeAccount,
    queryFn: () => fetchLpPositions(client, cfg!, activeAccount!.address),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="DeFi" subtitle="Only verified protocols on Robinhood Chain. Access is free; protocol fees and risks are always disclosed." />

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display font-bold">
            <Layers className="h-5 w-5 text-lime" /> Uniswap V3 liquidity positions
          </h2>
          {cfg && (
            <a className="text-xs text-mute hover:text-white" href={explorerAddressUrl(network, cfg.nonfungiblePositionManager)} target="_blank" rel="noreferrer">
              Position manager <ExternalLink className="inline h-3 w-3" />
            </a>
          )}
        </div>
        {!cfg ? (
          <Notice>No verified Uniswap deployment on {network.name}.</Notice>
        ) : positions.isLoading ? (
          <Skeleton className="h-24" />
        ) : positions.isError ? (
          <ErrorBox>{(positions.error as Error).message}</ErrorBox>
        ) : !positions.data?.length ? (
          <Empty icon={<Layers className="h-5 w-5" />} title="No liquidity positions">This address holds no Uniswap V3 position NFTs on {network.name}.</Empty>
        ) : (
          <ul className="space-y-2">
            {positions.data.map((p) => (
              <li key={p.tokenId.toString()} className="rounded-xl border border-white/[0.06] p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {p.token0.symbol} / {p.token1.symbol}
                  </span>
                  <Badge>{(p.fee / 10_000).toFixed(2)}% pool</Badge>
                  {p.liquidity === 0n ? <Badge>Closed</Badge> : p.inRange === null ? <Badge>Range unknown</Badge> : p.inRange ? <Badge tone="ok">In range · earning fees</Badge> : <Badge tone="warn">Out of range</Badge>}
                  <span className="ml-auto text-xs text-mute">#{p.tokenId.toString()}</span>
                </div>
                <p className="mt-2 text-xs text-mute">
                  Ticks {p.tickLower} → {p.tickUpper} {p.currentTick !== null && `(current ${p.currentTick})`} · liquidity {p.liquidity.toString()}
                </p>
                <p className="text-xs text-mute">
                  Uncollected (as last recorded): {fmtToken(p.tokensOwed0, p.token0.decimals)} {p.token0.symbol} · {fmtToken(p.tokensOwed1, p.token1.decimals)} {p.token1.symbol}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-mute">Liquidity provision carries impermanent-loss risk. Uniswap pool fees go to liquidity providers, not to InWIF.</p>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display font-bold">
          <ShieldQuestion className="h-5 w-5 text-lime" /> Staking, lending & borrowing
        </h2>
        <p className="text-sm text-mute">
          No staking, lending or borrowing protocol on Robinhood Chain has yet met InWIF&apos;s integration criteria, so none is offered. InWIF will not show yields it cannot verify on-chain.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mute">
          {CRITERIA.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
