/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), serial=(self), usb=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js needs inline scripts for hydration; no third-party scripts are loaded.
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // Wallet reads chain data from RPCs and the explorer directly; market data is proxied.
      "connect-src 'self' https: wss: http://127.0.0.1:8545 http://localhost:8545",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === '1'

const nextConfig = {
  reactStrictMode: true,
  // Expose only WHETHER a server-side managed RPC key exists — never the key itself — so the
  // browser routes RPC through /api/rpc, where the key is added. Desktop builds have no server.
  env: { NEXT_PUBLIC_RPC_RELAY_FIRST: !DESKTOP && process.env.DWELLIR_API_KEY?.trim() ? '1' : '' },
  // Desktop (Tauri) build: static export (see scripts/build-desktop.mjs, which
  // leaves the server-only relays in src/app/api out of the build).
  ...(DESKTOP ? { output: 'export', images: { unoptimized: true }, trailingSlash: true } : {}),
  transpilePackages: ['@inwif/core'],
  poweredByHeader: false,
  ...(DESKTOP ? {} : { async headers() { return [{ source: '/:path*', headers: securityHeaders }] } }),
  webpack: (config) => {
    // Optional peer deps pulled in by wallet connectors we do not use.
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

export default nextConfig
