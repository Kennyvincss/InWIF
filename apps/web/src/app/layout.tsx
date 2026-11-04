import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import './globals.css'
import { Providers } from '@/components/Providers'
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · InWIF' },
  description: SITE_DESCRIPTION,
  applicationName: 'InWIF',
  icons: { icon: '/icon.svg' },
  openGraph: { type: 'website', siteName: 'InWIF', title: SITE_TITLE, description: SITE_DESCRIPTION, url: SITE_URL },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
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
