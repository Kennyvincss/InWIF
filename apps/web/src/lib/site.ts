/** Canonical site origin. Accepts `example.com` or `https://example.com` (trailing slash optional). */
export function normaliseSiteUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim().replace(/\/+$/, '')
  if (!v) return 'https://inwif.xyz'
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    return new URL(withScheme).origin
  } catch {
    return 'https://inwif.xyz'
  }
}

export const SITE_URL = normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
export const SITE_TITLE = 'InWIF — Your Assets. Your Keys. Your Control.'
export const SITE_DESCRIPTION =
  'InWIF is a free, self-custody wallet for Robinhood Chain and the World Is Flat ($WIF) ecosystem, with a hardware wallet in development.'
