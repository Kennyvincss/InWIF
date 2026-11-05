'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WalletProvider } from '@/lib/wallet-store'
import { HardwareProvider } from '@/lib/hardware'
import { NotificationProvider } from '@/lib/notifications'

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }))
  return (
    <QueryClientProvider client={qc}>
        <WalletProvider>
          <HardwareProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </HardwareProvider>
        </WalletProvider>
      </QueryClientProvider>
  )
}
