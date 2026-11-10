'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAddress, type Address } from 'viem'
import {
  accountFromMnemonic,
  accountFromPrivateKey,
  checkSigninPassword,
  decryptSecret,
  deriveSigninKey,
  hashSigninKey,
  randomSalt,
  signinMessage,
  type EncryptedVault,
  type WalletSecret,
} from '@inwif/core'

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error ?? 'Something went wrong. Please try again.')
  return j
}

export function useSigninStatus(address?: Address) {
  return useQuery({
    queryKey: ['signin-status', address?.toLowerCase()],
    enabled: !!address,
    queryFn: async () => {
      const r = await fetch(`/api/signin/status?address=${address}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('Sign-in status is unavailable right now.')
      return (await r.json()) as { enabled: boolean }
    },
    staleTime: 60_000,
    retry: 1,
  })
}

export function useRefreshSigninStatus() {
  const qc = useQueryClient()
  return (address: Address) => qc.invalidateQueries({ queryKey: ['signin-status', address.toLowerCase()] })
}

/**
 * Turn on sign-in with @username + password: upload the wallet's existing device-encrypted
 * vault and the hash of a separately derived sign-in key. Signed by the wallet itself.
 */
export async function enableSignin(p: {
  address: Address
  index: number
  kind: 'mnemonic' | 'privateKey'
  name: string
  vault: EncryptedVault
  password: string
  sign: (message: string) => Promise<`0x${string}`>
}) {
  const rule = checkSigninPassword(p.password)
  if (!rule.ok) throw new Error(rule.problem)
  await decryptSecret(p.vault, p.password).catch(() => {
    throw new Error('Wrong password.')
  })
  const salt = randomSalt()
  const keyHash = await hashSigninKey(await deriveSigninKey(p.password, salt))
  const issuedAt = new Date().toISOString()
  const signature = await p.sign(signinMessage('enable', p.address, issuedAt))
  await post('/api/signin/setup', { address: p.address, issuedAt, signature, salt, keyHash, vault: p.vault, kind: p.kind, index: p.index, name: p.name })
}

export async function disableSignin(address: Address, sign: (message: string) => Promise<`0x${string}`>) {
  const issuedAt = new Date().toISOString()
  const signature = await sign(signinMessage('disable', address, issuedAt))
  await post('/api/signin/disable', { address, issuedAt, signature })
}

export interface SignedInWallet {
  address: Address
  index: number
  kind: 'mnemonic' | 'privateKey'
  name: string
  username: string | null
  vault: EncryptedVault
  secret: WalletSecret
}

/** Sign in on this device: fetch the encrypted wallet with @username + password and open it here. */
export async function signIn(username: string, password: string): Promise<SignedInWallet> {
  const name = username.trim().replace(/^@/, '').toLowerCase()
  const { salt } = await post<{ salt: string }>('/api/signin/salt', { username: name })
  const signinKey = await deriveSigninKey(password, salt)
  const r = await post<Omit<SignedInWallet, 'secret'>>('/api/signin/login', { username: name, signinKey })
  const secret = await decryptSecret(r.vault, password).catch(() => {
    throw new Error('Could not open the wallet with this password.')
  })
  const derived = secret.kind === 'mnemonic' ? accountFromMnemonic(secret.phrase, r.index).address : accountFromPrivateKey(secret.privateKey).address
  if (getAddress(derived) !== getAddress(r.address)) throw new Error('The downloaded wallet does not match this username. Nothing was added.')
  return { ...r, address: getAddress(r.address), secret }
}
