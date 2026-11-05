'use client'
import { NETWORKS, type NetworkConfig, type NetworkKey } from '@inwif/core'

/** Desktop (Tauri) build: static export with no InWIF server, so no relays. */
export const DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === '1'

/** Set at build time when the server holds a managed RPC key (the key itself is never exposed). */
export const RELAY_FIRST = process.env.NEXT_PUBLIC_RPC_RELAY_FIRST === '1'

export const LOCAL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LOCAL_NETWORK === 'true'

export const SELECTABLE_NETWORKS: NetworkKey[] = LOCAL_ENABLED
  ? ['robinhood', 'robinhoodTestnet', 'local']
  : ['robinhood', 'robinhoodTestnet']

/**
 * Network config as used in the browser: direct public RPCs first, then the
 * InWIF read-only RPC relay as a fallback (for RPCs without CORS). Explorer
 * calls go through the InWIF relay (allow-listed paths only).
 */
export function browserNetwork(key: NetworkKey): NetworkConfig {
  const base = NETWORKS[key]
  if (typeof window === 'undefined' || key === 'local' || DESKTOP) return base
  const origin = window.location.origin
  const relay = `${origin}/api/rpc/${key}`
  // With a managed RPC (Dwellir) configured on the server, the relay is the primary path:
  // it adds the server-side key and fails over to the public RPCs by itself.
  const relayFirst = RELAY_FIRST && !!base.managedRpc
  return {
    ...base,
    rpcUrls: relayFirst ? [relay, ...base.rpcUrls] : [...base.rpcUrls, relay],
    explorer: base.explorer.apiV2 ? { ...base.explorer, apiV2: `${origin}/api/explorer/${key}` } : base.explorer,
  }
}

/**
 * Explorer access order: the user's browser calls Blockscout directly first
 * (server IPs are often blocked by the explorer's bot protection), then falls
 * back to the InWIF relay. Desktop builds have no relay.
 */
export async function withExplorer<T>(key: NetworkKey, fn: (n: NetworkConfig) => Promise<T>): Promise<T> {
  const direct = NETWORKS[key]
  try {
    return await fn(direct)
  } catch (e) {
    const relay = browserNetwork(key)
    if (DESKTOP || relay.explorer.apiV2 === direct.explorer.apiV2) throw e
    return fn(relay)
  }
}
