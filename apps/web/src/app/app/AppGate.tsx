'use client'
import { usePathname } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Onboarding } from '@/components/Onboarding'
import { Spinner } from '@/components/ui'
import { useWallet } from '@/lib/wallet-store'

export function AppGate({ children }: { children: React.ReactNode }) {
  const { ready, state } = useWallet()
  const path = usePathname()
  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-lime" />
      </div>
    )
  const hasWallet = state.wallets.some((w) => !w.archived)
  // Hardware setup is reachable before any wallet exists.
  if (!hasWallet && !path.startsWith('/app/hardware'))
    return (
      <div className="min-h-screen bg-ink-950 bg-grid px-4 py-10">
        <Onboarding />
      </div>
    )
  return <AppShell>{children}</AppShell>
}
