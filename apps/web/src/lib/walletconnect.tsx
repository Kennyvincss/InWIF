'use client'
/**
 * WalletConnect (Reown WalletKit) integration: lets users connect InWIF to dApps.
 *
 * Security model:
 *  - Nothing is ever signed automatically. Every request opens an InWIF review
 *    screen (TxFlow for transactions, SignRequest for messages / typed data).
 *  - Only the active account is shared, only on networks InWIF supports.
 *  - Watch-only wallets cannot connect; dApps WalletConnect's Verify API marks
 *    as scams are blocked.
 *  - Sessions are listed and revocable in the Security Centre.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toHex } from 'viem'
import { NETWORKS } from '@inwif/core'
import type { IWalletKit } from '@reown/walletkit'
import type { ProposalTypes, SessionTypes, Verify } from '@walletconnect/types'
import { SELECTABLE_NETWORKS } from './net'
import { useWallet } from './wallet-store'
import { useNotify } from './notifications'

/** Public by design: protected by the domain allowlist in the Reown dashboard. */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || '8b2edb1e560d95b69a5eac692b07b323'

export const WC_METHODS = [
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData_v4',
  'eth_signTypedData',
  'wallet_switchEthereumChain',
  'eth_accounts',
  'eth_requestAccounts',
  'eth_chainId',
] as const
export const WC_EVENTS = ['accountsChanged', 'chainChanged'] as const

export const METHOD_LABELS: Record<string, string> = {
  eth_sendTransaction: 'Ask you to send transactions',
  personal_sign: 'Ask you to sign messages',
  eth_signTypedData_v4: 'Ask you to sign structured data (e.g. permits)',
  eth_signTypedData: 'Ask you to sign structured data (e.g. permits)',
  wallet_switchEthereumChain: 'Ask to switch network',
}

export const supportedChainIds = () => SELECTABLE_NETWORKS.map((k) => NETWORKS[k].chainId)

export type VerifyStatus = 'VALID' | 'INVALID' | 'UNKNOWN'
export interface VerifyInfo {
  origin: string
  validation: VerifyStatus
  isScam: boolean
}

export interface DappMeta {
  name: string
  url: string
  icon?: string
  description?: string
}

export interface PendingProposal {
  id: number
  params: ProposalTypes.Struct
  dapp: DappMeta
  verify: VerifyInfo
  requestedChains: string[]
  unsupportedRequired: string[]
}

export interface PendingRequest {
  topic: string
  id: number
  method: string
  params: unknown[]
  chainId: string
  dapp: DappMeta
  verify: VerifyInfo
}

export interface RpcError {
  code: number
  message: string
}

const toVerify = (v?: Verify.Context): VerifyInfo => ({
  origin: v?.verified?.origin ?? '',
  validation: (v?.verified?.validation as VerifyStatus) ?? 'UNKNOWN',
  isScam: v?.verified?.isScam === true,
})

const toDapp = (m?: { name?: string; url?: string; icons?: string[]; description?: string }): DappMeta => ({
  name: (m?.name || 'Unknown app').slice(0, 60),
  url: m?.url ?? '',
  icon: m?.icons?.find((i) => /^https:\/\//.test(i)),
  description: m?.description,
})

/** Every eip155 chain a proposal mentions (required + optional). */
export function proposalChains(p: Pick<ProposalTypes.Struct, 'requiredNamespaces' | 'optionalNamespaces'>): { required: string[]; all: string[] } {
  const required = new Set<string>()
  const all = new Set<string>()
  for (const [key, ns] of Object.entries(p.requiredNamespaces ?? {})) {
    const chains = ns.chains ?? (key.includes(':') ? [key] : [])
    chains.forEach((c) => {
      required.add(c)
      all.add(c)
    })
  }
  for (const [key, ns] of Object.entries(p.optionalNamespaces ?? {})) (ns.chains ?? (key.includes(':') ? [key] : [])).forEach((c) => all.add(c))
  return { required: [...required], all: [...all] }
}

interface Ctx {
  status: 'idle' | 'starting' | 'ready' | 'error'
  error?: string
  sessions: SessionTypes.Struct[]
  proposal: PendingProposal | null
  request: PendingRequest | null
  pair: (uri: string) => Promise<void>
  approve: () => Promise<void>
  reject: () => Promise<void>
  /** Answer the current request. `advance: false` keeps it on screen (e.g. until a tx confirms). */
  respond: (result: unknown, opts?: { advance?: boolean }) => Promise<void>
  respondError: (err: RpcError, opts?: { advance?: boolean }) => Promise<void>
  /** Remove the current request from the queue after answering with `advance: false`. */
  advance: () => void
  disconnect: (topic: string) => Promise<void>
}

const WcContext = createContext<Ctx | null>(null)

export function WalletConnectProvider({ children }: { children: React.ReactNode }) {
  const { activeAccount, activeWallet, state, update } = useWallet()
  const notify = useNotify()
  const kitRef = useRef<IWalletKit | null>(null)
  const utilsRef = useRef<typeof import('@walletconnect/utils') | null>(null)
  const [status, setStatus] = useState<Ctx['status']>('idle')
  const [error, setError] = useState<string>()
  const [sessions, setSessions] = useState<SessionTypes.Struct[]>([])
  const [proposal, setProposal] = useState<PendingProposal | null>(null)
  const [queue, setQueue] = useState<PendingRequest[]>([])
  const network = NETWORKS[state.network]

  const refreshSessions = useCallback(() => {
    const kit = kitRef.current
    setSessions(kit ? Object.values(kit.getActiveSessions()) : [])
  }, [])

  // Initialise once, in the browser only (lazy-loaded to keep the site bundle small).
  useEffect(() => {
    let cancelled = false
    setStatus('starting')
    ;(async () => {
      try {
        const [{ Core }, { WalletKit }, utils] = await Promise.all([import('@walletconnect/core'), import('@reown/walletkit'), import('@walletconnect/utils')])
        if (cancelled) return
        utilsRef.current = utils
        const kit = await WalletKit.init({
          core: new Core({ projectId: WALLETCONNECT_PROJECT_ID, telemetryEnabled: false }),
          metadata: {
            name: 'InWIF',
            description: 'Free self-custody wallet for Robinhood Chain',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://inwif.vercel.app',
            icons: [typeof window !== 'undefined' ? `${window.location.origin}/icon-512.png` : 'https://inwif.vercel.app/icon-512.png'],
          },
        })
        if (cancelled) return
        kitRef.current = kit
        kit.on('session_proposal', (e) => {
          const { required, all } = proposalChains(e.params)
          const supported = new Set(supportedChainIds().map((c) => `eip155:${c}`))
          setProposal({
            id: e.id,
            params: e.params,
            dapp: toDapp(e.params.proposer.metadata),
            verify: toVerify(e.verifyContext),
            requestedChains: all,
            unsupportedRequired: required.filter((c) => !supported.has(c)),
          })
        })
        kit.on('session_request', (e) => {
          const session = kit.getActiveSessions()[e.topic]
          setQueue((q) => [
            ...q,
            {
              topic: e.topic,
              id: e.id,
              method: e.params.request.method,
              params: (e.params.request.params ?? []) as unknown[],
              chainId: e.params.chainId,
              dapp: toDapp(session?.peer.metadata),
              verify: toVerify(e.verifyContext),
            },
          ])
        })
        kit.on('session_delete', () => refreshSessions())
        refreshSessions()
        setStatus('ready')
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshSessions])

  // Keep connected dApps in sync when the user switches account or network.
  const lastSync = useRef<string>('')
  useEffect(() => {
    const kit = kitRef.current
    const utils = utilsRef.current
    if (!kit || !utils || !activeAccount || status !== 'ready') return
    const key = `${activeAccount.address}:${network.chainId}`
    if (lastSync.current === key) return
    const first = lastSync.current === ''
    lastSync.current = key
    if (first) return
    for (const s of Object.values(kit.getActiveSessions())) {
      const chains = s.namespaces.eip155?.chains ?? []
      const chain = `eip155:${network.chainId}`
      const accounts = chains.map((c) => `${c}:${activeAccount.address}`)
      void kit
        .updateSession({ topic: s.topic, namespaces: { ...s.namespaces, eip155: { ...s.namespaces.eip155!, accounts } } })
        .then(() => kit.emitSessionEvent({ topic: s.topic, event: { name: 'accountsChanged', data: [activeAccount.address] }, chainId: chains.includes(chain) ? chain : chains[0]! }))
        .then(async () => {
          if (chains.includes(chain)) await kit.emitSessionEvent({ topic: s.topic, event: { name: 'chainChanged', data: toHex(network.chainId) }, chainId: chain })
        })
        .catch(() => undefined)
    }
  }, [activeAccount, network.chainId, status])

  const request = queue[0] ?? null
  const shift = () => setQueue((q) => q.slice(1))

  const value: Ctx = useMemo(
    () => ({
      status,
      error,
      sessions,
      proposal,
      request,
      pair: async (uri: string) => {
        const kit = kitRef.current
        if (!kit) throw new Error('WalletConnect is still starting. Try again in a moment.')
        const u = uri.trim()
        if (!/^wc:[0-9a-f]{64}@2\?/i.test(u)) throw new Error('That is not a WalletConnect link. Copy the "wc:…" link from the app’s QR code dialog.')
        await kit.pair({ uri: u })
      },
      approve: async () => {
        const kit = kitRef.current
        const utils = utilsRef.current
        if (!kit || !utils || !proposal) return
        if (!activeAccount || !activeWallet) throw new Error('Select an account first.')
        if (activeWallet.kind === 'watch') throw new Error('Watch-only wallets cannot connect to apps, because they cannot sign.')
        if (proposal.verify.isScam) throw new Error('This app is flagged as a known scam. InWIF will not connect to it.')
        const chains = supportedChainIds().map((c) => `eip155:${c}`)
        const namespaces = utils.buildApprovedNamespaces({
          proposal: proposal.params,
          supportedNamespaces: {
            eip155: { chains, methods: [...WC_METHODS], events: [...WC_EVENTS], accounts: chains.map((c) => `${c}:${activeAccount.address}`) },
          },
        })
        await kit.approveSession({ id: proposal.id, namespaces })
        notify.push({ type: 'security', title: `Connected to ${proposal.dapp.name}`, body: proposal.dapp.url })
        setProposal(null)
        refreshSessions()
      },
      reject: async () => {
        const kit = kitRef.current
        const utils = utilsRef.current
        if (kit && utils && proposal) await kit.rejectSession({ id: proposal.id, reason: utils.getSdkError('USER_REJECTED') }).catch(() => undefined)
        setProposal(null)
      },
      respond: async (result: unknown, opts?: { advance?: boolean }) => {
        const kit = kitRef.current
        if (kit && request) await kit.respondSessionRequest({ topic: request.topic, response: { id: request.id, jsonrpc: '2.0', result } })
        if (opts?.advance !== false) shift()
      },
      respondError: async (err: RpcError, opts?: { advance?: boolean }) => {
        const kit = kitRef.current
        if (kit && request) await kit.respondSessionRequest({ topic: request.topic, response: { id: request.id, jsonrpc: '2.0', error: err } }).catch(() => undefined)
        if (opts?.advance !== false) shift()
      },
      advance: shift,
      disconnect: async (topic: string) => {
        const kit = kitRef.current
        const utils = utilsRef.current
        if (!kit || !utils) return
        await kit.disconnectSession({ topic, reason: utils.getSdkError('USER_DISCONNECTED') }).catch(() => undefined)
        refreshSessions()
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, error, sessions, proposal, request, activeAccount, activeWallet],
  )

  // Network switch requests are handled here so the UI layer stays simple.
  useEffect(() => {
    if (!request || request.method !== 'wallet_switchEthereumChain') return
    const wanted = Number((request.params[0] as { chainId?: string })?.chainId)
    const key = SELECTABLE_NETWORKS.find((k) => NETWORKS[k].chainId === wanted)
    if (!key) {
      void value.respondError({ code: 4902, message: `InWIF does not support chain ${wanted}.` })
      return
    }
    update((s) => ({ ...s, network: key }))
    void value.respond(null)
  }, [request, update, value])

  return <WcContext.Provider value={value}>{children}</WcContext.Provider>
}

export function useWalletConnect() {
  const c = useContext(WcContext)
  if (!c) throw new Error('useWalletConnect must be used inside WalletConnectProvider')
  return c
}

/** EIP-1193 error codes used in responses to dApps. */
export const RPC_ERRORS = {
  userRejected: { code: 4001, message: 'User rejected the request.' },
  unauthorized: (m: string) => ({ code: 4100, message: m }),
  unsupported: (m: string) => ({ code: 4200, message: m }),
  wrongChain: (m: string) => ({ code: 4901, message: m }),
  invalidParams: (m: string) => ({ code: -32602, message: m }),
}
