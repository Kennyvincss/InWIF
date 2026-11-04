import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'InWIF — Your Assets. Your Keys. Your Control.',
  description:
    'InWIF is a free, self-custody wallet for Robinhood Chain and the World Is Flat ($WIF) ecosystem, with a hardware wallet in development.',
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = { themeColor: '#090B10', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
