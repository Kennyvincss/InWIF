'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { explorerTxUrl } from '@inwif/core'
import { load, save } from './storage'
import { useWallet, type Settings } from './wallet-store'
import { useActivity, useNetwork } from './hooks'

export type NotifyType = keyof Omit<Settings['notifications'], 'browser'>

export interface AppNotification {
  id: string
  type: NotifyType
  title: string
  body?: string
  href?: string
  at: number
  read: boolean
}

interface Ctx {
  items: AppNotification[]
  unread: number
  push: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
  markAllRead: () => void
  clear: () => void
}

const NotifyContext = createContext<Ctx | null>(null)
const KEY = 'inwif:notifications'

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { state } = useWallet()
  const [items, setItems] = useState<AppNotification[]>([])
  useEffect(() => setItems(load<AppNotification[]>(KEY, [])), [])

  const prefs = state.settings.notifications
  const push = useCallback<Ctx['push']>(
    (n) => {
      if (!prefs[n.type]) return
      const item: AppNotification = { ...n, id: `${Date.now()}-${Math.random()}`, at: Date.now(), read: false }
      setItems((prev) => {
        const next = [item, ...prev].slice(0, 100)
        save(KEY, next)
        return next
      })
      if (prefs.browser && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(n.title, { body: n.body, icon: '/icon-192.png' })
        } catch {
          /* ignore */
        }
      }
    },
    [prefs],
  )

  const value: Ctx = {
    items,
    unread: items.filter((i) => !i.read).length,
    push,
    markAllRead: () =>
      setItems((p) => {
        const next = p.map((i) => ({ ...i, read: true }))
        save(KEY, next)
        return next
      }),
    clear: () => {
      save(KEY, [])
      setItems([])
    },
  }
  return (
    <NotifyContext.Provider value={value}>
      <ActivityWatcher push={push} />
      {children}
    </NotifyContext.Provider>
  )
}

/** Turns newly observed explorer activity into notifications (incoming / outgoing / failed). */
function ActivityWatcher({ push }: { push: Ctx['push'] }) {
  const { activeAccount } = useWallet()
  const { network } = useNetwork()
  const activity = useActivity(activeAccount?.address)
  const seen = useRef<Set<string> | null>(null)
  const owner = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!activity.data || !activeAccount) return
    const key = `${network.key}:${activeAccount.address}`
    if (owner.current !== key) {
      owner.current = key
      seen.current = new Set(activity.data.map((i) => i.hash + i.kind + (i.tokenAddress ?? '')))
      return
    }
    for (const i of activity.data) {
      const id = i.hash + i.kind + (i.tokenAddress ?? '')
      if (seen.current!.has(id)) continue
      seen.current!.add(id)
      const amount = `${formatUnits(BigInt(i.value), i.decimals)} ${i.symbol}`
      if (i.status === 'failed') push({ type: 'failed', title: 'Transaction failed', body: i.hash, href: explorerTxUrl(network, i.hash) })
      else if (i.direction === 'in') push({ type: 'incoming', title: `Received ${amount}`, body: `From ${i.from}`, href: explorerTxUrl(network, i.hash) })
    }
  }, [activity.data, activeAccount, network, push])
  return null
}

export function useNotify() {
  const c = useContext(NotifyContext)
  if (!c) throw new Error('useNotify must be used inside NotificationProvider')
  return c
}
