import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  // The wallet itself (/app) is private, per-device UI; there is nothing to index there.
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/api'] }], sitemap: `${SITE_URL}/sitemap.xml` }
}
