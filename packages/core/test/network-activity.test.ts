import { describe, expect, it } from 'vitest'
import { fetchTokenTransfers, fetchTransactions, holdingsValueSeries, mergeActivity, NETWORKS, ROBINHOOD_MAINNET, SigningRefused, signAndBroadcast, verifyNetwork, INWIF_POLICY } from '../src'

const ME = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

describe('network config', () => {
  it('matches the public registry values', () => {
    expect(NETWORKS.robinhood.chainId).toBe(4663)
    expect(Object.keys(NETWORKS)).toEqual(['robinhood', 'local'])
    expect(NETWORKS.robinhood.nativeCurrency.symbol).toBe('ETH')
  })
  it('verifyNetwork fails closed on chain-id mismatch or RPC errors', async () => {
    const wrong = await verifyNetwork(ROBINHOOD_MAINNET, { getChainId: async () => 1, getBlockNumber: async () => 1n })
    expect(wrong.ok).toBe(false)
    const down = await verifyNetwork(ROBINHOOD_MAINNET, { getChainId: async () => { throw new Error('down') }, getBlockNumber: async () => 1n })
    expect(down.ok).toBe(false)
    const good = await verifyNetwork(ROBINHOOD_MAINNET, { getChainId: async () => 4663, getBlockNumber: async () => 5n })
    expect(good.ok).toBe(true)
  })
  it('policy: free, no fees, $WIF never required', () => {
    expect(INWIF_POLICY).toEqual({ free: true, subscriptions: false, serviceFeeBps: 0, wifRequiredForFeatures: false })
  })
})

describe('signing guard', () => {
  const prepared = { network: ROBINHOOD_MAINNET, tx: { type: 'eip1559' as const, chainId: 4663, nonce: 0, to: ME as `0x${string}`, gas: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n } }
  const signer = { kind: 'software' as const, address: ME as `0x${string}`, signTransaction: async () => { throw new Error('should not sign') } }
  const client = {} as never
  it('refuses without confirmation', async () => {
    await expect(signAndBroadcast(client, prepared, signer, { confirmed: false, verification: { ok: true, chainId: 4663, blockNumber: 1n, checkedAt: 0 } })).rejects.toBeInstanceOf(SigningRefused)
  })
  it('refuses on unverified network', async () => {
    await expect(signAndBroadcast(client, prepared, signer, { confirmed: true, verification: null })).rejects.toBeInstanceOf(SigningRefused)
    await expect(signAndBroadcast(client, prepared, signer, { confirmed: true, verification: { ok: false, reason: 'x', checkedAt: 0 } })).rejects.toBeInstanceOf(SigningRefused)
  })
})

describe('explorer activity parsing', () => {
  const mockFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
  it('parses Blockscout transactions (both field-name generations)', async () => {
    const page = await fetchTransactions(ROBINHOOD_MAINNET, ME, undefined, mockFetch({
      items: [
        { hash: '0x1', from: { hash: ME }, to: { hash: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }, value: '10', status: 'ok', timestamp: '2026-10-01T00:00:00Z', method: null, fee: { value: '5' }, block_number: 9 },
        { hash: '0x2', from: { hash: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }, to: { hash: ME }, value: '0', status: 'error', timestamp: '2026-10-02T00:00:00Z', method: 'swap', block: 10 },
      ],
      next_page_params: null,
    }))
    expect(page.items[0]!.direction).toBe('out')
    expect(page.items[0]!.status).toBe('success')
    expect(page.items[1]!.status).toBe('failed')
    expect(page.items[1]!.kind).toBe('contract')
    expect(page.items[1]!.blockNumber).toBe(10)
  })
  it('parses token transfers and merges newest-first', async () => {
    const t = await fetchTokenTransfers(ROBINHOOD_MAINNET, ME, {}, mockFetch({
      items: [{ transaction_hash: '0x3', from: { hash: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }, to: { hash: ME }, token: { address_hash: '0x5173b8eA6923c2d40267890D45C46a3480954773', symbol: 'WIF', decimals: '18' }, total: { value: '1000', decimals: '18' }, timestamp: '2026-10-03T00:00:00Z' }],
    }))
    expect(t.items[0]!.direction).toBe('in')
    expect(t.items[0]!.symbol).toBe('WIF')
    const merged = mergeActivity([{ ...t.items[0]!, hash: '0x9', timestamp: '2026-01-01' }], t.items, t.items)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.timestamp).toBe('2026-10-03T00:00:00Z')
  })
  it('surfaces explorer HTTP errors instead of inventing data', async () => {
    const f = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch
    await expect(fetchTransactions(ROBINHOOD_MAINNET, ME, undefined, f)).rejects.toThrow(/502/)
  })
})

describe('holdings value series', () => {
  it('values current holdings at historical closes', () => {
    const s = holdingsValueSeries([
      { amount: 2, prices: [{ t: 1, close: 10 }, { t: 3, close: 20 }] },
      { amount: 1, prices: [{ t: 2, close: 5 }] },
    ])
    expect(s).toEqual([{ t: 1, close: 20 }, { t: 2, close: 25 }, { t: 3, close: 45 }])
  })
})

describe('RPC transfer fallback', () => {
  it('reads transfers from logs in chunks, newest first, with real block timestamps', async () => {
    const { fetchTokenTransfersViaRpc } = await import('../src')
    const calls: { fromBlock: bigint; toBlock: bigint }[] = []
    const client = {
      getBlockNumber: async () => 25_000_000n,
      getLogs: async (q: { fromBlock: bigint; toBlock: bigint; args: { from?: string; to?: string } }) => {
        calls.push({ fromBlock: q.fromBlock, toBlock: q.toBlock })
        if (q.args.to && q.toBlock === 25_000_000n)
          return [{ address: '0x5173b8eA6923c2d40267890D45C46a3480954773', transactionHash: '0xaa', blockNumber: 24_000_000n, args: { from: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', to: ME, value: 5n } }]
        return []
      },
      getBlock: async () => ({ timestamp: 1_790_000_000n }),
    } as never
    const items = await fetchTokenTransfersViaRpc(client, ME, [{ address: '0x5173b8eA6923c2d40267890D45C46a3480954773', symbol: 'WIF', decimals: 18 }], { limit: 1 })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ direction: 'in', symbol: 'WIF', via: 'rpc', timestamp: new Date(1_790_000_000_000).toISOString() })
    expect(calls.every((c) => c.toBlock - c.fromBlock < 10_000_000n)).toBe(true)
  })
})
