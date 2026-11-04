/**
 * DeFi portfolio tracking: Uniswap V3 liquidity positions (NFTs) held by an address.
 * Read-only; values come straight from the NonfungiblePositionManager and pools.
 */
import { erc20Abi, parseAbi, zeroAddress, type Address, type PublicClient } from 'viem'
import { factoryAbi } from './swap'
import type { UniswapV3Config } from './networks'

export const npmAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
])
export const poolAbi = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'])

export interface LpPosition {
  tokenId: bigint
  token0: { address: Address; symbol: string; decimals: number }
  token1: { address: Address; symbol: string; decimals: number }
  fee: number
  tickLower: number
  tickUpper: number
  currentTick: number | null
  inRange: boolean | null
  liquidity: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
}

async function tokenMeta(client: PublicClient, address: Address) {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }).catch(() => '?'),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
  ])
  return { address, symbol, decimals }
}

export async function fetchLpPositions(client: PublicClient, cfg: UniswapV3Config, owner: Address, max = 25): Promise<LpPosition[]> {
  const n = await client.readContract({ address: cfg.nonfungiblePositionManager, abi: npmAbi, functionName: 'balanceOf', args: [owner] })
  const count = Number(n > BigInt(max) ? BigInt(max) : n)
  const ids = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      client.readContract({ address: cfg.nonfungiblePositionManager, abi: npmAbi, functionName: 'tokenOfOwnerByIndex', args: [owner, BigInt(i)] }),
    ),
  )
  return Promise.all(
    ids.map(async (tokenId) => {
      const p = await client.readContract({ address: cfg.nonfungiblePositionManager, abi: npmAbi, functionName: 'positions', args: [tokenId] })
      const [, , t0, t1, fee, tickLower, tickUpper, liquidity, , , owed0, owed1] = p
      const [token0, token1, pool] = await Promise.all([
        tokenMeta(client, t0),
        tokenMeta(client, t1),
        client.readContract({ address: cfg.factory, abi: factoryAbi, functionName: 'getPool', args: [t0, t1, fee] }),
      ])
      let currentTick: number | null = null
      if (pool !== zeroAddress) {
        try {
          currentTick = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' }))[1]
        } catch {
          currentTick = null
        }
      }
      return {
        tokenId,
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        currentTick,
        inRange: currentTick === null ? null : currentTick >= tickLower && currentTick < tickUpper,
        liquidity,
        tokensOwed0: owed0,
        tokensOwed1: owed1,
      }
    }),
  )
}
