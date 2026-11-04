'use client'
/**
 * Market data access. The web build goes through the InWIF relay (cached,
 * rate-limited); the desktop build has no server and calls GeckoTerminal directly.
 */
import { fetchPriceHistory, fetchTokenMarket, fetchTokenPrices, type ChartRange } from '@inwif/core'
import type { Address } from 'viem'
import { DESKTOP } from './net'

async function relay<T>(url: string): Promise<T | null> {
  const r = await fetch(url)
  if (r.status === 404) return null
  if (!r.ok) throw new Error('Market data unavailable')
  return (await r.json()) as T
}

export const market = {
  prices: (network: string, tokens: Address[]) =>
    DESKTOP ? fetchTokenPrices(network, tokens) : relay<Awaited<ReturnType<typeof fetchTokenPrices>>>(`/api/market/prices?network=${network}&tokens=${tokens.join(',')}`).then((r) => r ?? {}),
  token: (network: string, token: Address) =>
    DESKTOP ? fetchTokenMarket(network, token) : relay<Awaited<ReturnType<typeof fetchTokenMarket>>>(`/api/market/token?network=${network}&address=${token}`),
  history: (network: string, pool: Address, token: Address, range: ChartRange) =>
    DESKTOP
      ? fetchPriceHistory(network, pool, token, range)
      : relay<Awaited<ReturnType<typeof fetchPriceHistory>>>(`/api/market/ohlcv?network=${network}&pool=${pool}&token=${token}&range=${range}`).then((r) => r ?? []),
}
