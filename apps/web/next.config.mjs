/** @type {import('next').NextConfig} */
const origin = (u) => {
  try {
    return u ? new URL(u).origin : null
  } catch {
    return null
  }
}
const LOCAL = process.env.NEXT_PUBLIC_ENABLE_LOCAL_NETWORK === 'true' || process.env.NODE_ENV === 'development'
/**
 * Hosts the browser may connect to: InWIF itself (relays), the Robinhood Chain RPCs and the
 * explorer. Anything else is refused, so injected script could not send data to another host
 * over fetch/XHR/WebSocket. test/csp.test.ts keeps this in sync with the network config.
 */
export const CONNECT_SRC = [
  "'self'",
  'https://rpc.mainnet.chain.robinhood.com',
  'https://robinhood-rpc.publicnode.com',
  'https://robinhoodchain.blockscout.com',
  'https://rpc.testnet.chain.robinhood.com',
  'https://robinhood-sepolia-rpc.publicnode.com',
  'https://explorer.testnet.chain.robinhood.com',
  // Ethereum mainnet: read the user's L1 balance and send bridge deposits to Robinhood Chain.
  'https://ethereum-rpc.publicnode.com',
  ...[process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL, process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL, process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL].map(origin).filter(Boolean),
  ...(LOCAL ? ['http://127.0.0.1:8545', 'http://localhost:8545', origin(process.env.NEXT_PUBLIC_LOCAL_RPC_URL)].filter(Boolean) : []),
]

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), serial=(self), usb=(self)' },
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
      `connect-src ${[...new Set(CONNECT_SRC)].join(' ')}`,
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
  // Pretty pay links: inwif.app/@kenny → the public pay page for @kenny.
  ...(DESKTOP ? {} : { async rewrites() { return [{ source: '/@:name', destination: '/u?name=:name' }] } }),
  webpack: (config) => {
    // Optional peer deps pulled in by wallet connectors we do not use.
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

export default nextConfig
