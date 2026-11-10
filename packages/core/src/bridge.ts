import { createPublicClient, defineChain, encodeFunctionData, fallback, getAddress, http, parseAbi, type Address, type Hex, type PublicClient } from 'viem'

/** Ethereum mainnet, defined here rather than imported from viem/chains (which pulls in every chain). */
const mainnet = defineChain({
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://ethereum-rpc.publicnode.com'] } },
  blockExplorers: { default: { name: 'Etherscan', url: 'https://etherscan.io' } },
})

/**
 * Moving ETH from Ethereum to Robinhood Chain through Robinhood Chain's canonical
 * (Arbitrum Nitro) bridge.
 *
 * The user's wallet sends ETH to the L1 Delayed Inbox with `depositEth()`. The bridge
 * credits the same address on Robinhood Chain (for an ordinary wallet address there is no
 * aliasing) once the deposit is picked up, typically within about 10 minutes. There is no
 * fee on the Robinhood Chain side; the only cost is the Ethereum network fee.
 *
 * Contract addresses come from Robinhood Chain's documentation
 * (docs.robinhood.com/chain/protocol-contracts) and are re-checked on-chain before every
 * deposit by `verifyL1Bridge`: the Inbox must belong to the Bridge, the Bridge must allow
 * the Inbox and belong to the Rollup, and the Rollup must report Robinhood Chain's chain ID.
 */

export interface EthereumConfig {
  chainId: 1
  name: string
  rpcUrls: string[]
  explorer: string
}

/** Public Ethereum mainnet endpoint used by the browser (read balances, estimate, broadcast). */
export const ETHEREUM_MAINNET: EthereumConfig = {
  chainId: 1,
  name: 'Ethereum',
  rpcUrls: ['https://ethereum-rpc.publicnode.com'],
  explorer: 'https://etherscan.io',
}

export interface L1BridgeConfig {
  /** Chain ID the deposit lands on. */
  l2ChainId: number
  l2Name: string
  /** Delayed Inbox on Ethereum: `depositEth()` lives here. */
  inbox: Address
  bridge: Address
  rollup: Address
  source: string
}

export const ROBINHOOD_L1_BRIDGE: L1BridgeConfig = {
  l2ChainId: 4663,
  l2Name: 'Robinhood Chain',
  inbox: getAddress('0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D'),
  bridge: getAddress('0xDf8755334ce7A73cCF6b581C02eA649AE3E864b3'),
  rollup: getAddress('0x23A19d23e89166adedbDcB432518AB01e4272D94'),
  source: 'https://docs.robinhood.com/chain/protocol-contracts',
}

export const L1_BRIDGE_ABI = parseAbi([
  'function depositEth() payable returns (uint256)',
  'function bridge() view returns (address)',
  'function paused() view returns (bool)',
  'function allowListEnabled() view returns (bool)',
  'function allowedDelayedInboxes(address) view returns (bool)',
  'function rollup() view returns (address)',
  'function chainId() view returns (uint256)',
])

/** Typical gas for `depositEth()` (measured on mainnet: ~93k); used before an estimate exists. */
export const DEPOSIT_GAS_FALLBACK = 110_000n

export function getEthereumClient(rpcUrls: string[] = ETHEREUM_MAINNET.rpcUrls): PublicClient {
  const transports = rpcUrls.map((u) => http(u, { timeout: 15_000, retryCount: 1 }))
  return createPublicClient({ chain: mainnet, transport: transports.length > 1 ? fallback(transports) : transports[0]! }) as PublicClient
}

export type BridgeVerification = { ok: true } | { ok: false; reason: string }

/** Check, on Ethereum, that the configured contracts really are Robinhood Chain's bridge. */
export async function verifyL1Bridge(client: PublicClient, cfg: L1BridgeConfig = ROBINHOOD_L1_BRIDGE): Promise<BridgeVerification> {
  try {
    const chain = await client.getChainId()
    if (chain !== 1) return { ok: false, reason: `Connected to chain ${chain}, not Ethereum.` }
    const read = <T>(address: Address, functionName: 'bridge' | 'paused' | 'allowListEnabled' | 'rollup' | 'chainId', args: readonly unknown[] = []) =>
      client.readContract({ address, abi: L1_BRIDGE_ABI, functionName, args } as never) as Promise<T>
    const [inboxBridge, paused, allowList, allowed, rollup, l2ChainId] = await Promise.all([
      read<Address>(cfg.inbox, 'bridge'),
      read<boolean>(cfg.inbox, 'paused'),
      read<boolean>(cfg.inbox, 'allowListEnabled'),
      client.readContract({ address: cfg.bridge, abi: L1_BRIDGE_ABI, functionName: 'allowedDelayedInboxes', args: [cfg.inbox] }) as Promise<boolean>,
      read<Address>(cfg.bridge, 'rollup'),
      read<bigint>(cfg.rollup, 'chainId'),
    ])
    if (getAddress(inboxBridge) !== cfg.bridge) return { ok: false, reason: 'The bridge inbox does not belong to the expected bridge.' }
    if (!allowed) return { ok: false, reason: 'The bridge no longer accepts deposits from this inbox.' }
    if (getAddress(rollup) !== cfg.rollup) return { ok: false, reason: 'The bridge does not belong to the expected rollup.' }
    if (Number(l2ChainId) !== cfg.l2ChainId) return { ok: false, reason: `The bridge leads to chain ${l2ChainId}, not ${cfg.l2Name}.` }
    if (paused) return { ok: false, reason: 'Deposits are paused on the bridge right now.' }
    if (allowList) return { ok: false, reason: 'The bridge only accepts deposits from approved addresses right now.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `Could not check the bridge on Ethereum: ${(e as { shortMessage?: string }).shortMessage ?? (e as Error).message}` }
  }
}

/** The deposit transaction (to the Inbox, value = amount). */
export function buildDepositTx(amount: bigint, cfg: L1BridgeConfig = ROBINHOOD_L1_BRIDGE): { to: Address; value: bigint; data: Hex } {
  if (amount <= 0n) throw new Error('Amount must be greater than zero.')
  return { to: cfg.inbox, value: amount, data: encodeFunctionData({ abi: L1_BRIDGE_ABI, functionName: 'depositEth' }) }
}

export interface DepositFees {
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  /** Most the network fee can be (gas × maxFeePerGas). */
  maxFeeWei: bigint
  /** Likely fee at today's base fee. */
  expectedFeeWei: bigint
}

/** Estimate the Ethereum fee for a deposit from `from` (falls back to a typical gas figure). */
export async function estimateDepositFees(client: PublicClient, from: Address, amount: bigint, cfg: L1BridgeConfig = ROBINHOOD_L1_BRIDGE): Promise<DepositFees> {
  const [fees, block] = await Promise.all([client.estimateFeesPerGas(), client.getBlock()])
  let gas = DEPOSIT_GAS_FALLBACK
  if (amount > 0n) {
    try {
      const est = await client.estimateGas({ account: from, ...buildDepositTx(amount, cfg) })
      gas = (est * 12n) / 10n // 20% headroom
    } catch {
      /* not enough balance yet to estimate; keep the typical figure */
    }
  }
  const maxFeePerGas = fees.maxFeePerGas ?? (block.baseFeePerGas ?? 0n) * 2n
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 1_000_000n
  const expectedFeeWei = gas * ((block.baseFeePerGas ?? maxFeePerGas) + maxPriorityFeePerGas)
  return { gas, maxFeePerGas, maxPriorityFeePerGas, maxFeeWei: gas * maxFeePerGas, expectedFeeWei }
}

/** The most that can be moved while keeping enough for the Ethereum fee. */
export function maxDepositable(balance: bigint, fees: Pick<DepositFees, 'maxFeeWei'>): bigint {
  const left = balance - fees.maxFeeWei
  return left > 0n ? left : 0n
}
