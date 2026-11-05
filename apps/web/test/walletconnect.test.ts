import { describe, expect, it } from 'vitest'
import { proposalChains, supportedChainIds, WALLETCONNECT_PROJECT_ID } from '@/lib/walletconnect'

describe('WalletConnect helpers', () => {
  it('collects required and optional chains from a proposal', () => {
    const r = proposalChains({
      requiredNamespaces: { eip155: { chains: ['eip155:1'], methods: [], events: [] } },
      optionalNamespaces: { eip155: { chains: ['eip155:4663', 'eip155:1'], methods: [], events: [] }, 'eip155:46630': { methods: [], events: [] } },
    } as never)
    expect(r.required).toEqual(['eip155:1'])
    expect(r.all.sort()).toEqual(['eip155:1', 'eip155:46630', 'eip155:4663'].sort())
  })
  it('supports Robinhood Chain mainnet and testnet', () => {
    expect(supportedChainIds()).toEqual(expect.arrayContaining([4663, 46630]))
  })
  it('has a project ID (public, domain-restricted in the Reown dashboard)', () => {
    expect(WALLETCONNECT_PROJECT_ID).toMatch(/^[0-9a-f]{32}$/)
  })
})
