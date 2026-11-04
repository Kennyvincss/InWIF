'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { useState } from 'react'
import { WalletProvider } from '@/lib/wallet-store'
import { HardwareProvider } from '@/lib/hardware'
import { NotificationProvider } from '@/lib/notifications'
import { wagmiConfig } from '@/lib/wagmi'

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }))
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <WalletProvider>
          <HardwareProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </HardwareProvider>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
