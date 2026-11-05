import { describe, expect, it } from 'vitest'
import { ROBINHOOD_MAINNET, ROBINHOOD_TESTNET, getServerPublicClient, managedRpcKey, rpcUpstreams, shouldFailOver } from '../src'

const ENV = { DWELLIR_API_KEY: 'test-key' }

describe('server RPC upstreams (Dwellir)', () => {
  it('uses Dwellir first, with the key in a header (never in the URL), when configured', () => {
    const ups = rpcUpstreams(ROBINHOOD_MAINNET, ['eth_call'], ENV)
    expect(ups[0]).toEqual({ url: 'https://api-robinhood-mainnet-archive.n.dwellir.com', headers: { 'X-Api-Key': 'test-key' }, managed: true })
    expect(ups[0]!.url).not.toContain('test-key')
    expect(ups.slice(1).map((u) => u.url)).toEqual(ROBINHOOD_MAINNET.rpcUrls)
  })
  it('falls back to public RPCs only when no key is set', () => {
    expect(rpcUpstreams(ROBINHOOD_MAINNET, [], {}).every((u) => !u.managed)).toBe(true)
    expect(rpcUpstreams(ROBINHOOD_MAINNET, [], { DWELLIR_API_KEY: '  ' }).every((u) => !u.managed)).toBe(true)
    expect(managedRpcKey(ROBINHOOD_MAINNET, {})).toBeUndefined()
  })
  it('never sends eth_getLogs (or filters) to Dwellir', () => {
    expect(rpcUpstreams(ROBINHOOD_MAINNET, ['eth_getLogs'], ENV).some((u) => u.managed)).toBe(false)
    expect(rpcUpstreams(ROBINHOOD_MAINNET, ['eth_blockNumber', 'eth_newFilter'], ENV).some((u) => u.managed)).toBe(false)
  })
  it('leaves the testnet unchanged (Dwellir has no Robinhood testnet)', () => {
    expect(ROBINHOOD_TESTNET.managedRpc).toBeUndefined()
    expect(rpcUpstreams(ROBINHOOD_TESTNET, [], ENV).every((u) => !u.managed)).toBe(true)
  })
  it('fails over on limits, plan errors, auth errors and non-JSON bodies, not on normal results', () => {
    expect(shouldFailOver(200, '{"jsonrpc":"2.0","id":1,"result":"0x1237"}')).toBe(false)
    expect(shouldFailOver(200, '{"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted"}}')).toBe(false)
    expect(shouldFailOver(200, 'Your current plan does not support the eth_getLogs method.')).toBe(true)
    expect(shouldFailOver(429, '{}')).toBe(true)
    expect(shouldFailOver(401, '{}')).toBe(true)
    expect(shouldFailOver(503, '')).toBe(true)
    expect(shouldFailOver(200, '{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"limit exceeded"}}')).toBe(true)
    expect(shouldFailOver(200, '[{"id":1,"result":"0x1"},{"id":2,"error":{"code":-32000,"message":"daily request limit reached"}}]')).toBe(true)
  })
  it('builds and caches a server client', () => {
    expect(getServerPublicClient(ROBINHOOD_MAINNET, ENV)).toBe(getServerPublicClient(ROBINHOOD_MAINNET, ENV))
  })
})
