'use client'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ChartRange } from '@inwif/core'
import { market } from './market-client'
import type { Address } from 'viem'
import {
  DEFAULT_TOKENS,
  fetchTokenTransfers,
  fetchTransactions,
  fetchTokenTransfersViaRpc,
  getPublicClient,
  mergeActivity,
  readBalances,
  verifyNetwork,
  type NetworkConfig,
  type TokenInfo,
} from '@inwif/core'
import { browserNetwork, withExplorer } from './net'
import { useWallet } from './wallet-store'
import { toNumber } from './format'

export function useNetwork() {
  const { state } = useWallet()
  const network = useMemo(() => browserNetwork(state.network), [state.network])
  const client = useMemo(() => getPublicClient(network), [network])
  return { network, client }
}

export function useVerification() {
  const { network, client } = useNetwork()
  return useQuery({
    queryKey: ['verify', network.key],
    queryFn: () => verifyNetwork(network, client),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

export function useTokens(): TokenInfo[] {
  const { state } = useWallet()
  return useMemo(
    () => [...(DEFAULT_TOKENS[state.network] ?? []), ...(state.customTokens[state.network] ?? [])],
    [state.network, state.customTokens],
  )
}

export interface PricedBalance {
  key: string
  symbol: string
  name: string
  decimals: number
  raw: bigint
  amount: number
  token?: TokenInfo
  priceUsd: number | null
  change24hPct: number | null
  valueUsd: number | null
}

type PriceMap = Record<string, { priceUsd: number | null; change24hPct: number | null }>

export function usePrices(network: NetworkConfig, addresses: Address[]) {
  return useQuery({
    queryKey: ['prices', network.key, addresses.join(',')],
    enabled: !!network.geckoTerminalNetwork && addresses.length > 0,
    queryFn: (): Promise<PriceMap> => market.prices(network.geckoTerminalNetwork!, addresses),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
    retryDelay: (n) => 3_000 * 2 ** n,
  })
}

export function usePortfolio(address?: Address) {
  const { network, client } = useNetwork()
  const tokens = useTokens()
  const balances = useQuery({
    queryKey: ['balances', network.key, address, tokens.map((t) => t.address).join(',')],
    enabled: !!address,
    queryFn: () => readBalances(client, address!, tokens, network.nativeCurrency),
    refetchInterval: 30_000,
  })
  const weth = network.uniswapV3?.weth9
  const priceAddrs = useMemo(() => [...(weth ? [weth] : []), ...tokens.map((t) => t.address)], [weth, tokens])
  const prices = usePrices(network, priceAddrs)

  const rows: PricedBalance[] = useMemo(() => {
    if (!balances.data) return []
    const list = balances.data.balances.map((b) => {
      const isNative = b.token === 'native'
      const tok = isNative ? undefined : (b.token as TokenInfo)
      // Native ETH is priced from the WETH market (1:1 wrapped).
      const priceKey = isNative ? weth?.toLowerCase() : tok!.address.toLowerCase()
      const p = priceKey ? prices.data?.[priceKey] : undefined
      const amount = toNumber(b.raw, b.decimals)
      const priceUsd = p?.priceUsd ?? null
      return {
        key: isNative ? 'native' : tok!.address,
        symbol: b.symbol,
        name: isNative ? network.nativeCurrency.name : tok!.name,
        decimals: b.decimals,
        raw: b.raw,
        amount,
        token: tok,
        priceUsd,
        change24hPct: p?.change24hPct ?? null,
        valueUsd: priceUsd !== null ? amount * priceUsd : null,
      }
    })
    // $WIF is InWIF's home coin: always list it first.
    return [...list.filter((r) => r.token?.isWif), ...list.filter((r) => !r.token?.isWif)]
  }, [balances.data, prices.data, weth, network.nativeCurrency.name])

  const totals = useMemo(() => {
    const priced = rows.filter((r) => r.valueUsd !== null)
    const total = priced.reduce((s, r) => s + (r.valueUsd ?? 0), 0)
    const prev = priced.reduce((s, r) => {
      if (r.change24hPct === null || r.valueUsd === null) return s + (r.valueUsd ?? 0)
      return s + r.valueUsd / (1 + r.change24hPct / 100)
    }, 0)
    const change = prev > 0 ? ((total - prev) / prev) * 100 : null
    const unpriced = rows.filter((r) => r.valueUsd === null && r.raw > 0n)
    const pricedHeld = priced.filter((r) => r.raw > 0n)
    // Never show "$0" for a wallet whose assets simply have no market price.
    const unknown = prices.isError || (pricedHeld.length === 0 && unpriced.length > 0)
    return { total: unknown ? null : total, change24hPct: change, unpriced }
  }, [rows, prices.isError])

  return { balances, prices, rows, totals, network }
}

export function useActivity(address?: Address, token?: Address) {
  const { network, client } = useNetwork()
  const tokens = useTokens()
  return useQuery({
    queryKey: ['activity', network.key, address, token],
    enabled: !!address && !!network.explorer.apiV2,
    queryFn: async () => {
      try {
        const [txs, transfers] = await withExplorer(network.key, (n) =>
          Promise.all([token ? Promise.resolve({ items: [] }) : fetchTransactions(n, address!), fetchTokenTransfers(n, address!, { token })]),
        )
        return mergeActivity(txs.items, transfers.items)
      } catch (explorerError) {
        // Explorer unreachable: fall back to recent token transfers read straight from chain logs.
        const list = token ? tokens.filter((t) => t.address === token) : tokens
        if (!list.length) throw explorerError
        return fetchTokenTransfersViaRpc(client, address!, list)
      }
    },
    refetchInterval: 30_000,
    retry: 1,
  })
}

export interface MarketInfo {
  source: 'geckoterminal'
  priceUsd: number | null
  change24hPct: number | null
  fdvUsd: number | null
  marketCapUsd: number | null
  volume24hUsd: number | null
  liquidityUsd: number | null
  topPool?: string
  imageUrl?: string
  fetchedAt: number
}

export function useTokenMarket(network: NetworkConfig, token?: Address) {
  return useQuery({
    queryKey: ['market', network.key, token],
    enabled: !!token && !!network.geckoTerminalNetwork,
    queryFn: (): Promise<MarketInfo | null> => market.token(network.geckoTerminalNetwork!, token!),
    staleTime: 120_000,
    retry: 2,
    retryDelay: (n) => 3_000 * 2 ** n,
  })
}

export async function fetchHistory(network: NetworkConfig, token: Address, range: string) {
  // Errors propagate so React Query retries with backoff; "no market" (null) is a real empty result.
  const info = await market.token(network.geckoTerminalNetwork!, token)
  if (!info?.topPool) return []
  return market.history(network.geckoTerminalNetwork!, info.topPool, token, range as ChartRange)
}

export function usePortfolioHistory(rows: PricedBalance[], range: string) {
  const { network } = useNetwork()
  const weth = network.uniswapV3?.weth9
  const held = rows.filter((r) => r.amount > 0 && r.priceUsd !== null)
  return useQuery({
    queryKey: ['history', network.key, range, held.map((r) => `${r.key}:${r.amount}`).join(',')],
    enabled: held.length > 0 && !!network.geckoTerminalNetwork,
    queryFn: async () => {
      const { holdingsValueSeries } = await import('@inwif/core')
      const series = await Promise.all(
        held.map(async (r) => ({ amount: r.amount, prices: await fetchHistory(network, (r.key === 'native' ? weth : r.key) as Address, range) })),
      )
      return holdingsValueSeries(series.filter((s) => s.prices.length > 0))
    },
    staleTime: 300_000,
    retry: 2,
    retryDelay: (n) => 3_000 * 2 ** n,
  })
}
