'use client'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAddress, type Address } from 'viem'
import { createUsernameClaim, normaliseUsername, verifyUsernameClaim, type UsernameClaim } from '@inwif/core'

/**
 * Username lookups. The registry returns claims exactly as their owners signed them, and
 * every claim is verified here before its address is used: a claim that does not verify,
 * or that is for a different name or address than the one asked for, is treated as missing.
 */

async function verified(claim: unknown, expect: { username?: string; address?: string }): Promise<UsernameClaim | null> {
  if (!claim) return null
  const v = await verifyUsernameClaim(claim)
  if (!v.ok) return null
  if (expect.username && v.claim.username !== expect.username) return null
  if (expect.address && v.claim.address !== getAddress(expect.address)) return null
  return v.claim
}

export type NameLookup =
  | { status: 'taken'; claim: UsernameClaim }
  | { status: 'available' }
  | { status: 'similar'; owner?: string }
  | { status: 'invalid'; error: string }

export async function lookupName(name: string): Promise<NameLookup> {
  const n = normaliseUsername(name)
  if (!n.ok) return { status: 'invalid', error: n.error }
  const r = await fetch(`/api/names/${encodeURIComponent(n.username)}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('Usernames are unavailable right now. Try again in a moment.')
  const j = (await r.json()) as { claim?: unknown; available?: boolean; reason?: string; owner?: string; error?: string }
  if (j.claim) {
    const claim = await verified(j.claim, { username: n.username })
    if (!claim) throw new Error('Could not verify this username. Use the 0x address instead.')
    return { status: 'taken', claim }
  }
  if (j.reason === 'similar') return { status: 'similar', owner: j.owner }
  if (j.reason === 'invalid') return { status: 'invalid', error: j.error ?? 'Invalid username.' }
  return { status: 'available' }
}

export async function lookupAddress(address: Address): Promise<UsernameClaim | null> {
  const r = await fetch(`/api/names?address=${address}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('Usernames are unavailable right now.')
  const j = (await r.json()) as { claim?: unknown }
  return verified(j.claim, { address })
}

/** Sign (free, no transaction) and register a username for `address`. */
export async function claimUsername(name: string, address: Address, sign: (message: string) => Promise<`0x${string}`>): Promise<UsernameClaim> {
  const claim = await createUsernameClaim(name, address, sign)
  const r = await fetch('/api/names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim }) })
  const j = (await r.json().catch(() => ({}))) as { claim?: unknown; error?: string }
  if (!r.ok) throw new Error(j.error ?? 'Could not save your username. Try again.')
  const ok = await verified(j.claim, { username: claim.username, address })
  if (!ok) throw new Error('Could not save your username. Try again.')
  return ok
}

/** Verified usernames for many addresses (lower-case address → username). Unknown ones are left out. */
export async function lookupAddresses(addresses: string[]): Promise<Record<string, string>> {
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))].slice(0, 50)
  if (!list.length) return {}
  const r = await fetch(`/api/names?addresses=${list.join(',')}`, { cache: 'no-store' })
  if (!r.ok) return {}
  const j = (await r.json()) as { addresses?: string[]; claims?: unknown[] }
  const out: Record<string, string> = {}
  await Promise.all(
    (j.addresses ?? []).map(async (a, i) => {
      const c = await verified(j.claims?.[i], { address: a })
      if (c) out[a] = c.username
    }),
  )
  return out
}

/** Usernames for the counterparties shown in a list (e.g. Activity). Failures just show addresses. */
export function useUsernamesFor(addresses: (string | undefined)[]) {
  const list = [...new Set(addresses.filter((a): a is string => !!a).map((a) => a.toLowerCase()))].sort().slice(0, 50)
  return useQuery({ queryKey: ['usernames', list.join(',')], queryFn: () => lookupAddresses(list), enabled: list.length > 0, staleTime: 5 * 60_000, retry: 0 })
}

const addrKey = (a?: string) => ['username', a?.toLowerCase()] as const

/** The verified username of an address (null when it has none). */
export function useUsername(address?: Address) {
  return useQuery({
    queryKey: addrKey(address),
    queryFn: () => lookupAddress(address!),
    enabled: !!address,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

export function useSetUsername() {
  const qc = useQueryClient()
  return (claim: UsernameClaim) => qc.setQueryData(addrKey(claim.address), claim)
}

/** Look up a typed name after the user pauses typing. */
export function useNameLookup(input: string, delayMs = 350) {
  const n = input ? normaliseUsername(input) : null
  const name = n?.ok ? n.username : ''
  const [debounced, setDebounced] = useState(name)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(name), delayMs)
    return () => clearTimeout(t)
  }, [name, delayMs])
  const q = useQuery({ queryKey: ['name', debounced], queryFn: () => lookupName(debounced), enabled: !!debounced && debounced === name, staleTime: 15_000, retry: 1 })
  return { name, check: n, pending: !!name && (debounced !== name || q.isFetching), lookup: debounced === name ? q.data : undefined, error: q.error as Error | null }
}
