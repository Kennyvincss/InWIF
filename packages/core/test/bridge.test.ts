import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, type PublicClient } from 'viem'
import { L1_BRIDGE_ABI, ROBINHOOD_L1_BRIDGE, buildDepositTx, maxDepositable, verifyL1Bridge } from '../src/bridge'

const cfg = ROBINHOOD_L1_BRIDGE

/** A fake Ethereum client answering the bridge's view calls. */
function fakeClient(over: Partial<Record<string, unknown>> = {}, chainId = 1): PublicClient {
  const answers: Record<string, unknown> = {
    [`${cfg.inbox}:bridge`]: cfg.bridge,
    [`${cfg.inbox}:paused`]: false,
    [`${cfg.inbox}:allowListEnabled`]: false,
    [`${cfg.bridge}:allowedDelayedInboxes`]: true,
    [`${cfg.bridge}:rollup`]: cfg.rollup,
    [`${cfg.rollup}:chainId`]: 4663n,
    ...over,
  }
  return {
    getChainId: async () => chainId,
    readContract: async ({ address, functionName }: { address: string; functionName: string }) => answers[`${getAddress(address)}:${functionName}`],
  } as unknown as PublicClient
}

describe('L1 bridge (Ethereum → Robinhood Chain)', () => {
  it('uses the official Robinhood Chain contracts', () => {
    expect(cfg.inbox).toBe('0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D')
    expect(cfg.bridge).toBe('0xDf8755334ce7A73cCF6b581C02eA649AE3E864b3')
    expect(cfg.rollup).toBe('0x23A19d23e89166adedbDcB432518AB01e4272D94')
    expect(cfg.l2ChainId).toBe(4663)
  })

  it('builds a depositEth call to the inbox with the amount as value', () => {
    const tx = buildDepositTx(600_000_000_000_000n)
    expect(tx.to).toBe(cfg.inbox)
    expect(tx.value).toBe(600_000_000_000_000n)
    expect(decodeFunctionData({ abi: L1_BRIDGE_ABI, data: tx.data }).functionName).toBe('depositEth')
    expect(() => buildDepositTx(0n)).toThrow()
  })

  it('keeps the fee back when moving the maximum', () => {
    expect(maxDepositable(623_014_038_836_242n, { maxFeeWei: 20_000_000_000_000n })).toBe(603_014_038_836_242n)
    expect(maxDepositable(1_000n, { maxFeeWei: 5_000n })).toBe(0n)
  })

  it('accepts the genuine bridge', async () => {
    expect(await verifyL1Bridge(fakeClient())).toEqual({ ok: true })
  })

  it('refuses a wrong chain, a foreign inbox, a wrong rollup or chain ID, and paused deposits', async () => {
    const bad = '0x000000000000000000000000000000000000dEaD'
    expect((await verifyL1Bridge(fakeClient({}, 5))).ok).toBe(false)
    expect((await verifyL1Bridge(fakeClient({ [`${cfg.inbox}:bridge`]: bad }))).ok).toBe(false)
    expect((await verifyL1Bridge(fakeClient({ [`${cfg.bridge}:allowedDelayedInboxes`]: false }))).ok).toBe(false)
    expect((await verifyL1Bridge(fakeClient({ [`${cfg.bridge}:rollup`]: bad }))).ok).toBe(false)
    expect((await verifyL1Bridge(fakeClient({ [`${cfg.rollup}:chainId`]: 42161n }))).ok).toBe(false)
    expect((await verifyL1Bridge(fakeClient({ [`${cfg.inbox}:paused`]: true }))).ok).toBe(false)
    expect((await verifyL1Bridge(fakeClient({ [`${cfg.inbox}:allowListEnabled`]: true }))).ok).toBe(false)
  })
})
