'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet-store'
import { useActivity } from '@/lib/hooks'
import { ActivityList } from '@/components/ActivityList'
import { PageHeader, cx } from '@/components/ui'

const FILTERS = ['all', 'in', 'out', 'token', 'contract', 'failed'] as const

export default function ActivityPage() {
  const { activeAccount } = useWallet()
  const activity = useActivity(activeAccount?.address)
  const [f, setF] = useState<(typeof FILTERS)[number]>('all')
  const items = activity.data?.filter((i) =>
    f === 'all' ? true : f === 'in' || f === 'out' ? i.direction === f : f === 'failed' ? i.status === 'failed' : i.kind === f,
  )
  return (
    <div>
      <PageHeader title="Activity" subtitle="Transactions and token transfers indexed by the network's Blockscout explorer." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <button key={x} onClick={() => setF(x)} className={cx('chip capitalize', f === x && 'border-lime/40 text-lime')}>
            {x === 'in' ? 'Incoming' : x === 'out' ? 'Outgoing' : x}
          </button>
        ))}
      </div>
      <div className="card p-5">
        <ActivityList items={items} loading={activity.isLoading} error={activity.error as Error | null} />
      </div>
    </div>
  )
}
