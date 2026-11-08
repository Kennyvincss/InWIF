import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/site'

export const dynamic = 'force-static'

/** Web app manifest: lets people install InWIF to their home screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'InWIF Wallet',
    short_name: 'InWIF',
    description: SITE_DESCRIPTION,
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    categories: ['finance'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Send', url: '/app/send', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Receive', url: '/app/receive', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Swap', url: '/app/swap', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Live $WIF', url: '/app/wif/live', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
