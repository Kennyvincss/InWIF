import { erc20Abi, getAddress, isAddress, type Address, type PublicClient } from 'viem'
import type { NetworkKey } from './networks'

/** Official World Is Flat ($WIF) contract on Robinhood Chain mainnet. */
export const WIF_ADDRESS: Address = getAddress('0x5173b8eA6923c2d40267890D45C46a3480954773')

export interface TokenInfo {
  address: Address
  /** Display hints only — real metadata is always read on-chain via `readTokenMetadata`. */
  symbol: string
  name: string
  decimals: number
  /** Where this listing came from, shown in the UI for transparency. */
  source: string
  logo?: string
  isWif?: boolean
}

/**
 * Curated tokens shown by default. Addresses come from the sources listed in
 * `source`; symbol/decimals here are hints and are cross-checked on-chain.
 */
export const DEFAULT_TOKENS: Record<NetworkKey, TokenInfo[]> = {
  robinhood: [
    {
      address: WIF_ADDRESS,
      symbol: 'WIF',
      name: 'World is Flat',
      decimals: 18,
      source: 'Official World Is Flat contract (project brief)',
      isWif: true,
    },
    {
      address: getAddress('0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'),
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      source: 'Uniswap sdk-core WETH9 registry',
    },
    {
      address: getAddress('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'),
      symbol: 'USDG',
      name: 'Global Dollar',
      decimals: 6,
      source: 'Uniswap default token list / interface chain info',
    },
    {
      address: getAddress('0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4'),
      symbol: 'cbBTC',
      name: 'Coinbase Wrapped BTC',
      decimals: 8,
      source: 'Uniswap default token list',
    },
  ],
  local: [],
}

export interface OnchainTokenMetadata {
  address: Address
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
}

/** Read ERC-20 metadata directly from the contract. Throws if the address is not an ERC-20. */
export async function readTokenMetadata(
  client: PublicClient,
  address: Address,
): Promise<OnchainTokenMetadata> {
  const code = await client.getCode({ address })
  if (!code || code === '0x') throw new Error('No contract deployed at this address on this network.')
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'totalSupply' }),
  ])
  return { address, name, symbol, decimals, totalSupply }
}

export interface MetadataCheck {
  token: TokenInfo
  onchain?: OnchainTokenMetadata
  matches: boolean
  issues: string[]
}

/** Compare a curated listing with what the chain actually reports. */
export function compareMetadata(token: TokenInfo, onchain: OnchainTokenMetadata): MetadataCheck {
  const issues: string[] = []
  if (onchain.symbol !== token.symbol) issues.push(`Symbol on-chain is "${onchain.symbol}", listing says "${token.symbol}".`)
  if (onchain.decimals !== token.decimals)
    issues.push(`Decimals on-chain are ${onchain.decimals}, listing says ${token.decimals}.`)
  return { token, onchain, matches: issues.length === 0, issues }
}

export interface Balance {
  token: TokenInfo | 'native'
  raw: bigint
  decimals: number
  symbol: string
}

export async function readBalances(
  client: PublicClient,
  owner: Address,
  tokens: TokenInfo[],
  native: { symbol: string; decimals: number },
): Promise<{ balances: Balance[]; errors: { token: TokenInfo; error: string }[] }> {
  const errors: { token: TokenInfo; error: string }[] = []
  const nativeRaw = await client.getBalance({ address: owner })
  const results = await Promise.all(
    tokens.map(async (t) => {
      try {
        const raw = await client.readContract({
          address: t.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [owner],
        })
        const b: Balance = { token: t, raw, decimals: t.decimals, symbol: t.symbol }
        return b
      } catch (e) {
        errors.push({ token: t, error: (e as Error).message })
        return null
      }
    }),
  )
  return {
    balances: [
      { token: 'native', raw: nativeRaw, decimals: native.decimals, symbol: native.symbol },
      ...results.filter((b): b is Balance => b !== null),
    ],
    errors,
  }
}

export function normaliseTokenAddress(input: string): Address | null {
  const t = input.trim()
  return isAddress(t, { strict: false }) ? getAddress(t) : null
}
