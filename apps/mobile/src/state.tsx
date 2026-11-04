import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { accountFromMnemonic, getPublicClient, NETWORKS, type NetworkKey } from '@inwif/core'
import { loadMeta, saveMeta, saveSecret } from './secure'

export interface MobileWallet {
  id: string
  name: string
  address: `0x${string}`
  backedUp: boolean
}

interface Meta {
  wallets: MobileWallet[]
  activeId?: string
  network: NetworkKey
}

interface Ctx extends Meta {
  ready: boolean
  active?: MobileWallet
  network: NetworkKey
  client: ReturnType<typeof getPublicClient>
  addFromPhrase: (name: string, phrase: string, backedUp: boolean) => Promise<void>
  setNetwork: (n: NetworkKey) => void
  setActive: (id: string) => void
}

const C = createContext<Ctx | null>(null)

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta>({ wallets: [], network: 'robinhood' })
  const [ready, setReady] = useState(false)
  useEffect(() => {
    loadMeta<Meta>({ wallets: [], network: 'robinhood' }).then((m) => {
      setMeta(m)
      setReady(true)
    })
  }, [])
  const persist = (m: Meta) => {
    setMeta(m)
    void saveMeta(m)
  }
  const client = useMemo(() => getPublicClient(NETWORKS[meta.network]), [meta.network])
  const value: Ctx = {
    ...meta,
    ready,
    client,
    active: meta.wallets.find((w) => w.id === meta.activeId) ?? meta.wallets[0],
    addFromPhrase: async (name, phrase, backedUp) => {
      const id = `${Date.now()}`
      await saveSecret(id, phrase) // keychain, biometric-gated
      const w: MobileWallet = { id, name, address: accountFromMnemonic(phrase, 0).address, backedUp }
      persist({ ...meta, wallets: [...meta.wallets, w], activeId: id })
    },
    setNetwork: (network) => persist({ ...meta, network }),
    setActive: (activeId) => persist({ ...meta, activeId }),
  }
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useAppState() {
  const c = useContext(C)
  if (!c) throw new Error('StateProvider missing')
  return c
}
