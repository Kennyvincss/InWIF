'use client'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ETHEREUM_MAINNET, getEthereumClient, verifyL1Bridge } from '@inwif/core'

// Literal env read so Next.js inlines it in the browser bundle (used by the fork tests).
const OVERRIDE = process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL?.trim()
export const ETHEREUM_RPCS = OVERRIDE ? [OVERRIDE] : ETHEREUM_MAINNET.rpcUrls

export function useEthereumClient() {
  return useMemo(() => getEthereumClient(ETHEREUM_RPCS), [])
}

/** The account's ETH balance on Ethereum mainnet (same address as on Robinhood Chain). */
export function useEthereumBalance(address?: Address) {
  const client = useEthereumClient()
  return useQuery({
    queryKey: ['eth-l1-balance', address],
    enabled: !!address,
    queryFn: () => client.getBalance({ address: address! }),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  })
}

/** On-chain check that the bridge contracts are Robinhood Chain's official bridge. */
export function useBridgeVerification(enabled = true) {
  const client = useEthereumClient()
  return useQuery({ queryKey: ['l1-bridge-verified'], enabled, queryFn: () => verifyL1Bridge(client), staleTime: 10 * 60_000, retry: 1 })
}

export const etherscanTx = (hash: string) => `${ETHEREUM_MAINNET.explorer}/tx/${hash}`
