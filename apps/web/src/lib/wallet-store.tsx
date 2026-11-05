'use client'
/**
 * Local wallet state.
 *
 * - Persisted (localStorage): public wallet metadata + per-wallet AES-GCM vaults.
 * - Memory only: decrypted secrets for the wallet(s) the user has unlocked.
 *   Cleared on lock, auto-lock timeout, tab close.
 *
 * Nothing in this module ever sends data over the network.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getAddress, type Address } from 'viem'
import {
  DEFAULT_NETWORK,
  accountFromMnemonic,
  accountFromPrivateKey,
  decryptSecret,
  derivePrivateKey,
  encryptSecret,
  softwareSigner,
  type EncryptedVault,
  type NetworkKey,
  type SignerHandle,
  type TokenInfo,
  type WalletSecret,
} from '@inwif/core'
import { load, remove, save } from './storage'

export type WalletKind = 'mnemonic' | 'privateKey' | 'hardware' | 'watch'

export interface AccountRec {
  index: number
  address: Address
  label: string
}

export interface WalletRec {
  id: string
  name: string
  kind: WalletKind
  accounts: AccountRec[]
  vault?: EncryptedVault
  archived: boolean
  createdAt: number
  backedUp?: boolean
  device?: { serial: string; model: string; simulated: boolean }
}

export interface Settings {
  autoLockMinutes: number
  hideBalances: boolean
  slippageBps: number
  notifications: {
    incoming: boolean
    outgoing: boolean
    failed: boolean
    swaps: boolean
    hardware: boolean
    firmware: boolean
    security: boolean
    browser: boolean
  }
}

export interface Persisted {
  version: 1
  wallets: WalletRec[]
  activeWalletId?: string
  activeAccountIndex: number
  network: NetworkKey
  settings: Settings
  customTokens: Partial<Record<NetworkKey, TokenInfo[]>>
  blocklist: string[]
  quests: Record<string, number>
  deviceNames: Record<string, string>
}

const KEY = 'inwif:v1'

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 15,
  hideBalances: false,
  slippageBps: 50,
  notifications: {
    incoming: true,
    outgoing: true,
    failed: true,
    swaps: true,
    hardware: true,
    firmware: true,
    security: true,
    browser: false,
  },
}

const EMPTY: Persisted = {
  version: 1,
  wallets: [],
  activeAccountIndex: 0,
  network: DEFAULT_NETWORK,
  settings: DEFAULT_SETTINGS,
  customTokens: {},
  blocklist: [],
  quests: {},
  deviceNames: {},
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))

interface Ctx {
  ready: boolean
  state: Persisted
  activeWallet?: WalletRec
  activeAccount?: AccountRec
  unlocked: Set<string>
  isUnlocked: (walletId?: string) => boolean
  createFromMnemonic: (p: { name: string; phrase: string; password: string; backedUp: boolean }) => Promise<WalletRec>
  importPrivateKey: (p: { name: string; privateKey: `0x${string}`; password: string }) => Promise<WalletRec>
  addHardwareWallet: (p: { name: string; serial: string; model: string; simulated: boolean; accounts: AccountRec[] }) => WalletRec
  addWatchWallet: (p: { name: string; address: Address }) => WalletRec
  unlock: (walletId: string, password: string) => Promise<void>
  lock: () => void
  setActive: (walletId: string, accountIndex?: number) => void
  rename: (walletId: string, name: string) => void
  renameAccount: (walletId: string, index: number, label: string) => void
  setArchived: (walletId: string, archived: boolean) => void
  deleteWallet: (walletId: string) => void
  addAccount: (walletId: string) => AccountRec
  markBackedUp: (walletId: string) => void
  revealSecret: (walletId: string, password: string) => Promise<WalletSecret>
  softwareSignerFor: (walletId: string, index: number) => SignerHandle
  update: (fn: (s: Persisted) => Persisted) => void
  resetAll: () => void
}

const WalletContext = createContext<Ctx | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY)
  const [ready, setReady] = useState(false)
  const secrets = useRef(new Map<string, WalletSecret>())
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())

  useEffect(() => {
    const s = load<Persisted>(KEY, EMPTY)
    setState({ ...EMPTY, ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings, notifications: { ...DEFAULT_SETTINGS.notifications, ...s.settings?.notifications } } })
    setReady(true)
  }, [])

  const update = useCallback((fn: (s: Persisted) => Persisted) => {
    setState((prev) => {
      const next = fn(prev)
      save(KEY, next)
      return next
    })
  }, [])

  const lock = useCallback(() => {
    secrets.current.clear()
    setUnlocked(new Set())
  }, [])

  // Auto-lock after inactivity.
  useEffect(() => {
    if (!unlocked.size) return
    let t: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(t)
      t = setTimeout(lock, state.settings.autoLockMinutes * 60_000)
    }
    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(t)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [unlocked, state.settings.autoLockMinutes, lock])

  const markUnlocked = (id: string, secret: WalletSecret) => {
    secrets.current.set(id, secret)
    setUnlocked(new Set(secrets.current.keys()))
  }

  const addWallet = (w: WalletRec) =>
    update((s) => ({ ...s, wallets: [...s.wallets, w], activeWalletId: w.id, activeAccountIndex: w.accounts[0]?.index ?? 0 }))

  const createFromMnemonic: Ctx['createFromMnemonic'] = async ({ name, phrase, password, backedUp }) => {
    const vault = await encryptSecret({ kind: 'mnemonic', phrase }, password)
    const address = accountFromMnemonic(phrase, 0).address
    const w: WalletRec = { id: uid(), name, kind: 'mnemonic', accounts: [{ index: 0, address, label: 'Account 1' }], vault, archived: false, createdAt: Date.now(), backedUp }
    addWallet(w)
    markUnlocked(w.id, { kind: 'mnemonic', phrase })
    return w
  }

  const importPrivateKey: Ctx['importPrivateKey'] = async ({ name, privateKey, password }) => {
    const vault = await encryptSecret({ kind: 'privateKey', privateKey }, password)
    const address = accountFromPrivateKey(privateKey).address
    const w: WalletRec = { id: uid(), name, kind: 'privateKey', accounts: [{ index: 0, address, label: 'Imported key' }], vault, archived: false, createdAt: Date.now(), backedUp: true }
    addWallet(w)
    markUnlocked(w.id, { kind: 'privateKey', privateKey })
    return w
  }

  const addHardwareWallet: Ctx['addHardwareWallet'] = ({ name, serial, model, simulated, accounts }) => {
    const w: WalletRec = { id: uid(), name, kind: 'hardware', accounts, archived: false, createdAt: Date.now(), backedUp: true, device: { serial, model, simulated } }
    addWallet(w)
    return w
  }

  const addWatchWallet: Ctx['addWatchWallet'] = ({ name, address }) => {
    const w: WalletRec = { id: uid(), name, kind: 'watch', accounts: [{ index: 0, address: getAddress(address), label: 'Watch-only' }], archived: false, createdAt: Date.now(), backedUp: true }
    addWallet(w)
    return w
  }

  const find = (id: string) => {
    const w = state.wallets.find((x) => x.id === id)
    if (!w) throw new Error('Wallet not found')
    return w
  }

  const unlock: Ctx['unlock'] = async (walletId, password) => {
    const w = find(walletId)
    if (!w.vault) throw new Error('This wallet has no local keys to unlock.')
    markUnlocked(walletId, await decryptSecret(w.vault, password))
  }

  const revealSecret: Ctx['revealSecret'] = async (walletId, password) => {
    const w = find(walletId)
    if (!w.vault) throw new Error('This wallet has no local keys.')
    return decryptSecret(w.vault, password) // always re-verify the password
  }

  const addAccount: Ctx['addAccount'] = (walletId) => {
    const w = find(walletId)
    if (w.kind !== 'mnemonic') throw new Error('Only recovery-phrase wallets can derive more accounts here.')
    const secret = secrets.current.get(walletId)
    if (!secret || secret.kind !== 'mnemonic') throw new Error('Unlock this wallet first.')
    const index = Math.max(...w.accounts.map((a) => a.index)) + 1
    if (index > 99) throw new Error('Account limit reached for this wallet (100).')
    const rec: AccountRec = { index, address: accountFromMnemonic(secret.phrase, index).address, label: `Account ${index + 1}` }
    update((s) => ({ ...s, wallets: s.wallets.map((x) => (x.id === walletId ? { ...x, accounts: [...x.accounts, rec] } : x)) }))
    return rec
  }

  const softwareSignerFor: Ctx['softwareSignerFor'] = (walletId, index) => {
    const secret = secrets.current.get(walletId)
    if (!secret) throw new Error('Wallet is locked.')
    const key = secret.kind === 'mnemonic' ? derivePrivateKey(secret.phrase, index) : secret.privateKey
    return softwareSigner(key)
  }

  const activeWallet = state.wallets.find((w) => w.id === state.activeWalletId && !w.archived) ?? state.wallets.find((w) => !w.archived)
  const activeAccount = activeWallet?.accounts.find((a) => a.index === state.activeAccountIndex) ?? activeWallet?.accounts[0]

  const value: Ctx = {
    ready,
    state,
    activeWallet,
    activeAccount,
    unlocked,
    isUnlocked: (id) => {
      const w = id ? state.wallets.find((x) => x.id === id) : activeWallet
      if (!w) return false
      if (w.kind === 'hardware' || w.kind === 'watch') return true
      return unlocked.has(w.id)
    },
    createFromMnemonic,
    importPrivateKey,
    addHardwareWallet,
    addWatchWallet,
    unlock,
    lock,
    setActive: (walletId, accountIndex) =>
      update((s) => ({ ...s, activeWalletId: walletId, activeAccountIndex: accountIndex ?? s.wallets.find((w) => w.id === walletId)?.accounts[0]?.index ?? 0 })),
    rename: (id, name) => update((s) => ({ ...s, wallets: s.wallets.map((w) => (w.id === id ? { ...w, name: name.slice(0, 40) } : w)) })),
    renameAccount: (id, index, label) =>
      update((s) => ({
        ...s,
        wallets: s.wallets.map((w) => (w.id === id ? { ...w, accounts: w.accounts.map((a) => (a.index === index ? { ...a, label: label.slice(0, 40) } : a)) } : w)),
      })),
    setArchived: (id, archived) => update((s) => ({ ...s, wallets: s.wallets.map((w) => (w.id === id ? { ...w, archived } : w)) })),
    deleteWallet: (id) => {
      secrets.current.delete(id)
      setUnlocked(new Set(secrets.current.keys()))
      update((s) => ({ ...s, wallets: s.wallets.filter((w) => w.id !== id), activeWalletId: s.activeWalletId === id ? undefined : s.activeWalletId }))
    },
    addAccount,
    markBackedUp: (id) => update((s) => ({ ...s, wallets: s.wallets.map((w) => (w.id === id ? { ...w, backedUp: true } : w)) })),
    revealSecret,
    softwareSignerFor,
    update,
    resetAll: () => {
      lock()
      remove(KEY)
      setState(EMPTY)
    },
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memo = useMemo(() => value, [state, unlocked, ready])
  return <WalletContext.Provider value={memo}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const c = useContext(WalletContext)
  if (!c) throw new Error('useWallet must be used inside WalletProvider')
  return c
}
