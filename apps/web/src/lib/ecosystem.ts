/**
 * Registry of applications built around $WIF that InWIF links to.
 *
 * Entries are added only after review (contract addresses verified on the
 * explorer, source available, no mandatory payments). Third-party apps are
 * never given access to keys; InWIF only links out or reads public data.
 */
export interface EcosystemApp {
  id: string
  name: string
  description: string
  category: 'built-in' | 'defi' | 'community' | 'tooling'
  href: string
  contracts?: string[]
  status: 'live' | 'testnet' | 'planned'
  reviewedAt?: string
}

export const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: 'inwif-wif-swap',
    name: 'Swap for $WIF',
    description: 'Swap ETH or tokens for $WIF through the verified Uniswap V3 deployment, with zero InWIF fee.',
    category: 'built-in',
    href: '/app/swap',
    status: 'live',
  },
  {
    id: 'inwif-rewards',
    name: 'InWIF Rewards',
    description: 'Transparently funded reward campaigns for security education and community activity. Unaudited — testnet only.',
    category: 'built-in',
    href: '/app/wif#rewards',
    status: 'testnet',
  },
  {
    id: 'inwif-security',
    name: 'Approval checker',
    description: 'See and revoke every live $WIF allowance your wallet has granted.',
    category: 'built-in',
    href: '/app/security',
    status: 'live',
  },
]

export const LISTING_CRITERIA = [
  'Deployed contracts verified on the Robinhood Chain explorer',
  'Public source code and a named maintainer',
  'No mandatory payments to access the app',
  'No request for recovery phrases or private keys, ever',
  'Clear disclosure of protocol fees and risks',
]
