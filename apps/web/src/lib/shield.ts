'use client'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { flagActivity, trustedCounterparties, type ActivityItem, type ScamFlag } from '@inwif/core'
import { useActivity, useNetwork, useTokens } from './hooks'
import { useWallet } from './wallet-store'

export const activityKey = (i: ActivityItem) => `${i.hash}-${i.kind}-${i.tokenAddress ?? ''}-${i.value}-${i.direction}`

/**
 * Scam shield for one account, computed on this device from its own history:
 *  - `trusted`: addresses the user really deals with (own accounts, saved usernames,
 *    recipients of their own payments);
 *  - `flags`: history entries that look like address poisoning or spam.
 */
export function useScamShield(address?: Address) {
  const { state } = useWallet()
  const { network } = useNetwork()
  const tokens = useTokens()
  const activity = useActivity(address)
  return useMemo(() => {
    const items = activity.data ?? []
    const self = state.wallets.flatMap((w) => w.accounts.map((a) => a.address))
    const trusted = trustedCounterparties(items, { self, knownTokens: tokens.map((t) => t.address), extra: Object.values(state.namePins ?? {}) })
    const knownTokens = [
      ...tokens.map((t) => ({ address: t.address, symbol: t.symbol })),
      { address: '0x0000000000000000000000000000000000000000' as Address, symbol: network.nativeCurrency.symbol },
    ]
    const raw = flagActivity(items, { self, knownTokens, trusted })
    const flags = new Map<string, ScamFlag>()
    raw.forEach((f, i) => flags.set(activityKey(i), f))
    return { trusted, flags, ready: !!activity.data }
  }, [activity.data, state.wallets, state.namePins, tokens, network.nativeCurrency.symbol])
}
