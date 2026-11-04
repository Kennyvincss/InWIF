/**
 * Central network configuration for InWIF.
 *
 * Every parameter here is sourced from a public, citable registry (see `sources`)
 * and is additionally re-verified at runtime by `verifyNetwork()` — the wallet
 * refuses to sign or broadcast on a network whose live `eth_chainId` does not
 * match the configured value.
 *
 * Sources (retrieved 2026-11-04):
 *  - ethereum-lists/chains `_data/chains/eip155-4663.json` and `eip155-46630.json`
 *    (the registry behind chainlist.org)
 *  - Uniswap/interface `packages/uniswap/src/features/chains/evm/info/robinhood.ts`
 *  - Uniswap/sdks `sdks/sdk-core/src/addresses.ts` and `entities/weth9.ts`
 */
import { defineChain, type Address, type Chain } from 'viem'

export type NetworkKey = 'robinhood' | 'robinhoodTestnet' | 'local'

export interface ExplorerConfig {
  name: string
  url: string
  /** Blockscout REST API v2 base, used for activity history. */
  apiV2?: string
}

export interface UniswapV3Config {
  factory: Address
  quoterV2: Address
  swapRouter02: Address
  nonfungiblePositionManager: Address
  /** Wrapped native token used for ETH routes. */
  weth9: Address
  feeTiers: readonly number[]
}

export interface NetworkConfig {
  key: NetworkKey
  chainId: number
  name: string
  shortName: string
  isTestnet: boolean
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  explorer: ExplorerConfig
  /** Optional market-data network slug for GeckoTerminal. */
  geckoTerminalNetwork?: string
  uniswapV3?: UniswapV3Config
  sources: string[]
  /**
   * Whether value-moving transactions are allowed on this network at all.
   * Even when true, the wallet still requires a successful runtime chain-id
   * verification before signing.
   */
  transactionsEnabled: boolean
}

const env = (k: string): string | undefined => {
  try {
    // Works in Node and in Next.js (NEXT_PUBLIC_* are inlined at build time).
    return typeof process !== 'undefined' ? process.env?.[k] : undefined
  } catch {
    return undefined
  }
}

export const ROBINHOOD_MAINNET: NetworkConfig = {
  key: 'robinhood',
  chainId: 4663,
  name: 'Robinhood Chain',
  shortName: 'robinhoodchain',
  isTestnet: false,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [
    env('NEXT_PUBLIC_ROBINHOOD_RPC_URL') ?? 'https://rpc.mainnet.chain.robinhood.com',
    'https://robinhood-rpc.publicnode.com',
  ],
  explorer: {
    name: 'Blockscout',
    url: 'https://robinhoodchain.blockscout.com',
    apiV2: 'https://robinhoodchain.blockscout.com/api/v2',
  },
  geckoTerminalNetwork: 'robinhood',
  uniswapV3: {
    factory: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
    quoterV2: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7',
    swapRouter02: '0xcaf681a66d020601342297493863e78c959e5cb2',
    nonfungiblePositionManager: '0x73991a25c818bf1f1128deaab1492d45638de0d3',
    weth9: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    feeTiers: [100, 500, 3000, 10000],
  },
  sources: [
    'https://github.com/ethereum-lists/chains/blob/master/_data/chains/eip155-4663.json',
    'https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts',
    'https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/entities/weth9.ts',
    'https://docs.robinhood.com/chain/',
  ],
  transactionsEnabled: true,
}

export const ROBINHOOD_TESTNET: NetworkConfig = {
  key: 'robinhoodTestnet',
  chainId: 46630,
  name: 'Robinhood Chain Testnet',
  shortName: 'rh-testnet',
  isTestnet: true,
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [
    env('NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL') ?? 'https://rpc.testnet.chain.robinhood.com/rpc',
    'https://robinhood-sepolia-rpc.publicnode.com',
  ],
  explorer: {
    name: 'Blockscout (testnet)',
    url: 'https://explorer.testnet.chain.robinhood.com',
    apiV2: 'https://explorer.testnet.chain.robinhood.com/api/v2',
  },
  sources: ['https://github.com/ethereum-lists/chains/blob/master/_data/chains/eip155-46630.json'],
  transactionsEnabled: true,
}

/** Local Anvil/Hardhat development node. Never shown unless explicitly enabled. */
export const LOCAL_DEV: NetworkConfig = {
  key: 'local',
  chainId: 31337,
  name: 'Local development (Anvil)',
  shortName: 'local',
  isTestnet: true,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [env('NEXT_PUBLIC_LOCAL_RPC_URL') ?? 'http://127.0.0.1:8545'],
  explorer: { name: 'None', url: '' },
  sources: ['foundry anvil default'],
  transactionsEnabled: true,
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  robinhood: ROBINHOOD_MAINNET,
  robinhoodTestnet: ROBINHOOD_TESTNET,
  local: LOCAL_DEV,
}

export const DEFAULT_NETWORK: NetworkKey = 'robinhood'

export function getNetwork(key: NetworkKey): NetworkConfig {
  return NETWORKS[key]
}

export function networkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId)
}

/** Convert an InWIF network config into a viem `Chain`. */
export function toViemChain(n: NetworkConfig): Chain {
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: n.explorer.url
      ? { default: { name: n.explorer.name, url: n.explorer.url } }
      : undefined,
    testnet: n.isTestnet,
  })
}

export function explorerTxUrl(n: NetworkConfig, hash: string): string | undefined {
  return n.explorer.url ? `${n.explorer.url}/tx/${hash}` : undefined
}

export function explorerAddressUrl(n: NetworkConfig, address: string): string | undefined {
  return n.explorer.url ? `${n.explorer.url}/address/${address}` : undefined
}

export function explorerTokenUrl(n: NetworkConfig, token: string): string | undefined {
  return n.explorer.url ? `${n.explorer.url}/token/${token}` : undefined
}
