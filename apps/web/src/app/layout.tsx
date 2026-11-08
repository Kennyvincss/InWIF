import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Providers } from '@/components/Providers'
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · InWIF' },
  description: SITE_DESCRIPTION,
  applicationName: 'InWIF',
  icons: { icon: '/icon.svg' },
  // iPhone/iPad: open full-screen from the home screen, like an app.
  appleWebApp: { capable: true, title: 'InWIF', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  openGraph: { type: 'website', siteName: 'InWIF', title: SITE_TITLE, description: SITE_DESCRIPTION, url: SITE_URL },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
}

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
