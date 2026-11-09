'use client'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits, type Address } from 'viem'
import { computeJourney, fetchTokenTransfers, fetchTokenTransfersViaRpc, flagActivity, trustedCounterparties, type ActivityItem, type JourneyTransfer } from '@inwif/core'
import { fetchHistory, useNetwork, usePortfolio, useTokens } from './hooks'
import { withExplorer } from './net'
import { useWallet } from './wallet-store'

const MAX_PAGES = 20

/**
 * The account's full $WIF history (explorer, paged; chain logs as a fallback) and daily
 * $WIF prices, turned into a cost basis and profit/loss on this device.
 */
export function useWifJourney(address?: Address) {
  const { network, client } = useNetwork()
  const { state } = useWallet()
  const tokens = useTokens()
  const wif = tokens.find((t) => t.isWif)
  const { rows } = usePortfolio(address)
  const wifRow = rows.find((r) => r.token?.isWif)

  const transfers = useQuery({
    queryKey: ['wif-journey', network.key, address, wif?.address],
    enabled: !!address && !!wif,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<{ items: ActivityItem[]; complete: boolean }> => {
      try {
        const items: ActivityItem[] = []
        let next: Record<string, string | number> | undefined
        let pages = 0
        do {
          const page = await withExplorer(network.key, (n) => fetchTokenTransfers(n, address!, { token: wif!.address, next }))
          items.push(...page.items)
          next = page.next
        } while (next && ++pages < MAX_PAGES)
        return { items, complete: !next }
      } catch {
        // Explorer unreachable: read the transfers straight from the chain (slower, capped).
        const latest = await client.getBlockNumber()
        const items = await fetchTokenTransfersViaRpc(client, address!, [wif!], { maxBlocks: latest, limit: 200 })
        return { items, complete: items.length < 200 }
      }
    },
  })

  const prices = useQuery({
    queryKey: ['wif-journey-prices', network.key, wif?.address],
    enabled: !!wif && !!network.geckoTerminalNetwork,
    staleTime: 10 * 60_000,
    retry: 2,
    retryDelay: (n) => 3_000 * 2 ** n,
    queryFn: () => fetchHistory(network, wif!.address, 'all'),
  })

  const journey = useMemo(() => {
    if (!transfers.data || !prices.data || !wifRow || !wif) return null
    // Leave out entries the scam shield flags (e.g. dust planted from look-alike addresses).
    const self = state.wallets.flatMap((w) => w.accounts.map((a) => a.address))
    const items = transfers.data.items
    const trusted = trustedCounterparties(items, { self, knownTokens: [wif.address], extra: Object.values(state.namePins ?? {}) })
    const flags = flagActivity(items, { self, knownTokens: [{ address: wif.address, symbol: wif.symbol }], trusted })
    const list: JourneyTransfer[] = items
      .filter((i) => !flags.has(i) && i.direction !== 'self' && i.timestamp && BigInt(i.value) > 0n)
      .map((i) => ({ t: Math.floor(Date.parse(i.timestamp!) / 1000), amount: Number(formatUnits(BigInt(i.value), i.decimals)), direction: i.direction as 'in' | 'out', seq: i.blockNumber }))
    return computeJourney(list, prices.data, { currentPriceUsd: wifRow.priceUsd, balance: wifRow.amount })
  }, [transfers.data, prices.data, wifRow, wif, state.wallets, state.namePins])

  return {
    journey,
    complete: transfers.data?.complete ?? true,
    currentPriceUsd: wifRow?.priceUsd ?? null,
    loading: transfers.isLoading || prices.isLoading || !wifRow,
    error: (transfers.error ?? prices.error) as Error | null,
  }
}
