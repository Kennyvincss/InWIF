import type { Metadata } from 'next'
import { AppGate } from './AppGate'

export const metadata: Metadata = { title: 'InWIF Wallet' }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppGate>{children}</AppGate>
}
