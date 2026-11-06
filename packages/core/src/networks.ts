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
import { defineChain, type Address, type Chain, type Hex } from 'viem'

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

/** Uniswap V4 pool key (currency 0x0 = native ETH). */
export interface V4PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export interface V4PoolListing {
  /** keccak256(abi.encode(key)); checked against `key` before every quote. */
  id: Hex
  key: V4PoolKey
  label: string
  /** Who receives the swap fee. Shown to the user before they swap. */
  feeNote: string
}

export interface UniswapV4Config {
  poolManager: Address
  universalRouter: Address
  quoter: Address
  stateView: Address
  permit2: Address
  /**
   * The only V4 pools InWIF routes through. A V4 pool can carry a hook that
   * runs on every swap, so pools are listed one by one after review, never discovered.
   */
  pools: readonly V4PoolListing[]
}

/**
 * Managed RPC provider used only from SERVER code (relays, backend), never
 * shipped to browsers. The API key is sent in a header from a server-side
 * environment variable.
 */
export interface ManagedRpcConfig {
  provider: 'dwellir'
  /** Base HTTPS URL, without the key. */
  url: string
  /** Header that carries the key. */
  apiKeyHeader: string
  /** Server-side environment variable holding the key. */
  apiKeyEnv: string
  /** Node type offered by the provider for this network. */
  node: 'archive' | 'full'
  /** Methods that must NOT be sent to this provider (plan / range limits). */
  excludedMethods: readonly string[]
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
  /** Optional managed RPC (server-side only, see ManagedRpcConfig). */
  managedRpc?: ManagedRpcConfig
  /** Optional market-data network slug for GeckoTerminal. */
  geckoTerminalNetwork?: string
  uniswapV3?: UniswapV3Config
  uniswapV4?: UniswapV4Config
  sources: string[]
  /**
   * Whether value-moving transactions are allowed on this network at all.
   * Even when true, the wallet still requires a successful runtime chain-id
   * verification before signing.
   */
  transactionsEnabled: boolean
}

/**
 * Optional RPC overrides. Each variable is written out literally because Next.js only
 * inlines `process.env.NEXT_PUBLIC_*` into browser code when the name is spelled out;
 * a lookup by computed name is always undefined in the browser.
 */
const read = (f: () => string | undefined): string | undefined => {
  try {
    return f() || undefined
  } catch {
    return undefined // no `process` in this runtime
  }
}
const RPC_OVERRIDE = {
  robinhood: read(() => process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL),
  robinhoodTestnet: read(() => process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL),
  local: read(() => process.env.NEXT_PUBLIC_LOCAL_RPC_URL),
}

export const ROBINHOOD_MAINNET: NetworkConfig = {
  key: 'robinhood',
  chainId: 4663,
  name: 'Robinhood Chain',
  shortName: 'robinhoodchain',
  isTestnet: false,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [
    RPC_OVERRIDE.robinhood ?? 'https://rpc.mainnet.chain.robinhood.com',
    'https://robinhood-rpc.publicnode.com',
  ],
  explorer: {
    name: 'Blockscout',
    url: 'https://robinhoodchain.blockscout.com',
    apiV2: 'https://robinhoodchain.blockscout.com/api/v2',
  },
  // Dwellir Robinhood Chain mainnet (archive). https://www.dwellir.com/docs/robinhood
  // eth_getLogs is unavailable on the Free plan and capped at 500 / 10,000 blocks on paid plans,
  // far below InWIF's history scans, so log queries always use the public RPCs.
  managedRpc: {
    provider: 'dwellir',
    url: 'https://api-robinhood-mainnet-archive.n.dwellir.com',
    apiKeyHeader: 'X-Api-Key',
    apiKeyEnv: 'DWELLIR_API_KEY',
    node: 'archive',
    excludedMethods: ['eth_getLogs', 'eth_newFilter', 'eth_getFilterLogs', 'eth_getFilterChanges'],
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
  // Official Uniswap V4 deployment for chain 4663 (Uniswap/sdks sdk-core addresses.ts;
  // Universal Router v2.1.1 from universal-router-sdk constants.ts).
  uniswapV4: {
    poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
    universalRouter: '0x8876789976decbfcbbbe364623c63652db8c0904',
    quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
    stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    pools: [
      {
        // The main $WIF market: created by Pons V2 when $WIF graduated from its bonding curve.
        // The LP fee is 0; the Pons hook (afterSwap with return delta) takes the swap fee.
        id: '0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79',
        key: {
          currency0: '0x0000000000000000000000000000000000000000',
          currency1: '0x5173b8eA6923c2d40267890D45C46a3480954773',
          fee: 0,
          tickSpacing: 200,
          hooks: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
        },
        label: 'Pons $WIF/ETH pool (Uniswap V4)',
        feeNote: 'charged by the Pons hook; goes to Pons and the token creator, not to liquidity providers',
      },
    ],
  },
  sources: [
    'https://github.com/ethereum-lists/chains/blob/master/_data/chains/eip155-4663.json',
    'https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts',
    'https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/entities/weth9.ts',
    'https://github.com/Uniswap/sdks/blob/main/sdks/universal-router-sdk/src/utils/constants.ts',
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
    RPC_OVERRIDE.robinhoodTestnet ?? 'https://rpc.testnet.chain.robinhood.com/rpc',
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
  rpcUrls: [RPC_OVERRIDE.local ?? 'http://127.0.0.1:8545'],
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
