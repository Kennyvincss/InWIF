'use client'
/**
 * Deep link for dApps: /app/connect?uri=wc:…
 * Never auto-connects: the user confirms in the dialog first.
 */
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { WcConnectModal } from '@/components/WalletConnectUI'
import { PageHeader } from '@/components/ui'

function ConnectInner() {
  const params = useSearchParams()
  const [open, setOpen] = useState(true)
  const uri = params.get('uri') ?? ''
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Connect an app" subtitle="Link InWIF to a website or app with WalletConnect." />
      <button className="btn-primary" onClick={() => setOpen(true)}>
        Open connection dialog
      </button>
      <WcConnectModal open={open} onClose={() => setOpen(false)} initialUri={uri} />
    </div>
  )
}

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectInner />
    </Suspense>
  )
}
