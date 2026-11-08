'use client'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, FileCode2, RefreshCw, XCircle } from 'lucide-react'
import { explorerTxUrl, type ActivityItem } from '@inwif/core'
import { fmtToken, timeAgo } from '@/lib/format'
import { useNetwork } from '@/lib/hooks'
import { useUsernamesFor } from '@/lib/usernames'
import { Badge, Empty, ErrorBox, Skeleton } from './ui'

export function ActivityList({
  items,
  loading,
  error,
  limit,
  emptyText = 'No transactions found for this address on this network yet.',
}: {
  items?: ActivityItem[]
  loading?: boolean
  error?: Error | null
  limit?: number
  emptyText?: string
}) {
  const { network } = useNetwork()
  const names = useUsernamesFor((items ?? []).slice(0, limit ?? 50).map((i) => (i.direction === 'in' ? i.from : i.to)))
  const who = (a?: string) => (a && names.data?.[a.toLowerCase()] ? `@${names.data[a.toLowerCase()]}` : a)
  if (!network.explorer.apiV2)
    return <Empty icon={<RefreshCw className="h-5 w-5" />} title="History unavailable">Transaction history isn&apos;t available on {network.name}.</Empty>
  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  if (error) return <ErrorBox>Could not load activity right now. Balances above are read directly from the chain and are unaffected.</ErrorBox>
  const viaRpc = items?.[0]?.via === 'rpc'
  if (!items?.length) return <Empty icon={<RefreshCw className="h-5 w-5" />} title="No activity yet">{emptyText}</Empty>
  return (
    <>
    {viaRpc && (
      <p className="mb-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-[#ffe7a8]">
        Showing your recent token transfers. Full history, including ETH transfers, will appear shortly.
      </p>
    )}
    <ul className="divide-y divide-white/[0.05]">
      {items.slice(0, limit).map((i) => {
        const Icon = i.status === 'failed' ? XCircle : i.kind === 'contract' ? FileCode2 : i.direction === 'in' ? ArrowDownLeft : ArrowUpRight
        const label =
          i.kind === 'contract' ? (i.method ? `Called ${i.method}` : 'Contract interaction') : i.direction === 'in' ? 'Received' : i.direction === 'self' ? 'Self-transfer' : 'Sent'
        const url = explorerTxUrl(network, i.hash)
        return (
          <li key={`${i.hash}-${i.kind}-${i.tokenAddress ?? ''}-${i.value}`} className="flex items-center gap-3 py-3">
            <span className={`rounded-xl p-2 ${i.status === 'failed' ? 'bg-bad/10 text-bad' : i.direction === 'in' ? 'bg-ok/10 text-ok' : 'bg-white/5 text-mute'}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {label}
                {i.status === 'failed' && <Badge tone="bad">Failed</Badge>}
                {i.status === 'pending' && <Badge tone="warn">Pending</Badge>}
              </p>
              <p className="truncate font-mono text-xs text-mute">{i.direction === 'in' ? `from ${who(i.from)}` : `to ${i.to ? who(i.to) : 'contract creation'}`}</p>
            </div>
            <div className="text-right">
              {BigInt(i.value) > 0n && (
                <p className={`text-sm font-semibold ${i.direction === 'in' ? 'text-ok' : ''}`}>
                  {i.direction === 'in' ? '+' : i.direction === 'out' ? '−' : ''}
                  {fmtToken(i.value, i.decimals)} {i.symbol}
                </p>
              )}
              <p className="text-xs text-mute">{timeAgo(i.timestamp)}</p>
            </div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-mute hover:text-white" aria-label="Open in explorer">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </li>
        )
      })}
    </ul>
    </>
  )
}
