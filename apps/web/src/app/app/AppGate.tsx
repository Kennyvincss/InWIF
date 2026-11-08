'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Onboarding } from '@/components/Onboarding'
import { Spinner } from '@/components/ui'
import { useWallet } from '@/lib/wallet-store'

export function AppGate({ children }: { children: React.ReactNode }) {
  const { ready, state } = useWallet()
  const path = usePathname()
  const hasWallet = state.wallets.some((w) => !w.archived)
  // Keep onboarding on screen until the user finishes it, even after the wallet is created.
  const [onboarding, setOnboarding] = useState<boolean | null>(null)
  useEffect(() => {
    if (ready && onboarding === null) setOnboarding(!hasWallet)
  }, [ready, hasWallet, onboarding])

  if (!ready || onboarding === null)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-lime" />
      </div>
    )
  // Hardware setup is reachable before any wallet exists.
  if ((onboarding || !hasWallet) && !path.startsWith('/app/hardware'))
    return (
      <div className="ambient min-h-screen px-4 py-10">
        <Onboarding onFinished={() => setOnboarding(false)} />
      </div>
    )
  return <AppShell>{children}</AppShell>
}
