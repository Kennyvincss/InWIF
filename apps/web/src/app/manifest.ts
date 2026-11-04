import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/site'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InWIF Wallet',
    short_name: 'InWIF',
    description: SITE_DESCRIPTION,
    start_url: '/app',
    display: 'standalone',
    background_color: '#090B10',
    theme_color: '#090B10',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
