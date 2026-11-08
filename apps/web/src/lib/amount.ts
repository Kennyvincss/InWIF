'use client'
import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { useNetwork } from './hooks'

/**
 * ETH to keep back for the network fee when filling an amount from the native balance:
 * `gasUnits` at the current max fee, with 50% headroom for fee changes.
 */
export function useGasReserve(gasUnits: bigint) {
  const { network, client } = useNetwork()
  const q = useQuery({
    queryKey: ['gas-reserve', network.key, gasUnits.toString()],
    queryFn: async () => {
      const f = await client.estimateFeesPerGas()
      return ((f.maxFeePerGas ?? f.gasPrice ?? 0n) * gasUnits * 3n) / 2n
    },
    staleTime: 30_000,
  })
  return q.data
}

/**
 * Amount string for `pct`% of `available`, rounded DOWN to 6 decimals so the field stays
 * readable and never exceeds the balance. With `exactAtFull`, 100% is the exact balance so
 * no token dust is left (used for tokens; ETH already keeps a fee reserve).
 */
export function percentOf(available: bigint, decimals: number, pct: number, exactAtFull = true): string {
  if (available <= 0n) return '0'
  const raw = (available * BigInt(pct)) / 100n
  if ((pct >= 100 && exactAtFull) || decimals <= 6) return trimZeros(formatUnits(raw, decimals))
  const step = 10n ** BigInt(decimals - 6)
  const floored = (raw / step) * step
  return trimZeros(formatUnits(floored > 0n ? floored : raw, decimals))
}

const trimZeros = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s)
