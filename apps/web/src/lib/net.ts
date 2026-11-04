'use client'
import { NETWORKS, type NetworkConfig, type NetworkKey } from '@inwif/core'

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
  if (typeof window === 'undefined' || key === 'local') return base
  const origin = window.location.origin
  return {
    ...base,
    rpcUrls: [...base.rpcUrls, `${origin}/api/rpc/${key}`],
    explorer: base.explorer.apiV2 ? { ...base.explorer, apiV2: `${origin}/api/explorer/${key}` } : base.explorer,
  }
}
