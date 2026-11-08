'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Share2 } from 'lucide-react'
import { NETWORKS } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useActivity, useNetwork } from '@/lib/hooks'
import { SELECTABLE_NETWORKS } from '@/lib/net'
import { ActivityList } from '@/components/ActivityList'
import { CopyButton, Notice, PageHeader } from '@/components/ui'

export default function ReceivePage() {
  const { activeAccount, state, update } = useWallet()
  const { network } = useNetwork()
  const [qr, setQr] = useState<string>('')
  const address = activeAccount?.address
  const activity = useActivity(address)

  useEffect(() => {
    if (!address) return
    // EIP-681 URI so wallets that scan it pick the right chain.
    QRCode.toDataURL(`ethereum:${address}@${network.chainId}`, { margin: 1, width: 560, color: { dark: '#090B10', light: '#FFFFFF' } }).then(setQr)
  }, [address, network.chainId])

  if (!address) return null
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Receive" subtitle="Share this address to receive ETH, $WIF or any token on the selected network." />
      <div className="card grid gap-6 p-6 sm:grid-cols-[220px,1fr]">
        <div className="rounded-2xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={`QR code for ${address}`} className="h-auto w-full" />}
        </div>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="rnet">Network</label>
            <select id="rnet" className="input" value={state.network} onChange={(e) => update((s) => ({ ...s, network: e.target.value as typeof s.network }))}>
              {SELECTABLE_NETWORKS.map((k) => (
                <option key={k} value={k}>
                  {NETWORKS[k].name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="label">Your address</p>
            <p className="break-all rounded-xl bg-ink-900 p-3 font-mono text-sm">{address}</p>
          </div>
          <div className="flex gap-2">
            <CopyButton value={address} label="Copy address" />
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => navigator.share({ title: 'My InWIF address', text: address })}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            )}
          </div>
          <Notice tone="warn">Only send assets on {network.name}. Sending from another chain to this address may require a bridge and can result in loss.</Notice>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="mb-2 font-display font-bold">Incoming transactions</h2>
        <ActivityList items={activity.data?.filter((i) => i.direction === 'in')} loading={activity.isLoading} error={activity.error as Error | null} emptyText="Nothing received on this network yet." />
      </div>
    </div>
  )
}
