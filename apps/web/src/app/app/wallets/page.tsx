'use client'
import { useState } from 'react'
import { Archive, ArchiveRestore, Eye, KeyRound, Plus, Trash2, Unlock } from 'lucide-react'
import { shortAddress, type WalletSecret } from '@inwif/core'
import { useWallet, type WalletRec } from '@/lib/wallet-store'
import { Onboarding } from '@/components/Onboarding'
import { Badge, CopyButton, ErrorBox, Modal, Notice, PageHeader, cx } from '@/components/ui'

export default function WalletsPage() {
  const w = useWallet()
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const list = w.state.wallets.filter((x) => x.archived === showArchived)
  return (
    <div>
      <PageHeader
        title="Wallets"
        subtitle="Unlimited wallets and accounts. Each wallet's keys are encrypted separately and never shared between wallets."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? 'Show active' : 'Show archived'}
            </button>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add wallet
            </button>
          </>
        }
      />
      <div className="space-y-4">
        {list.length === 0 && <Notice>No {showArchived ? 'archived' : 'active'} wallets.</Notice>}
        {list.map((x) => (
          <WalletCard key={x.id} wallet={x} />
        ))}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add wallet" wide>
        <Onboarding embedded onFinished={() => setAdding(false)} />
      </Modal>
    </div>
  )
}

function WalletCard({ wallet }: { wallet: WalletRec }) {
  const w = useWallet()
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<null | 'unlock' | 'reveal'>(null)
  const [secret, setSecret] = useState<WalletSecret | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState(wallet.name)
  const unlocked = w.isUnlocked(wallet.id)
  const hasKeys = wallet.kind === 'mnemonic' || wallet.kind === 'privateKey'

  async function submit() {
    setErr(null)
    try {
      if (mode === 'unlock') await w.unlock(wallet.id, pw)
      else setSecret(await w.revealSecret(wallet.id, pw))
      if (mode === 'unlock') setMode(null)
    } catch (e) {
      setErr((e as Error).message)
    }
    setPw('')
  }

  return (
    <section className={cx('card p-5', w.activeWallet?.id === wallet.id && 'border-lime/30')}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="min-w-0 bg-transparent font-display text-lg font-bold outline-none focus:underline"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && w.rename(wallet.id, name.trim())}
          aria-label="Wallet name"
        />
        <Badge tone={wallet.kind === 'hardware' ? 'lime' : 'mute'}>
          {wallet.kind === 'mnemonic' ? 'Recovery phrase' : wallet.kind === 'privateKey' ? 'Private key' : wallet.kind === 'hardware' ? (wallet.device?.simulated ? 'Hardware (simulator)' : 'Hardware') : 'Watch-only'}
        </Badge>
        {hasKeys && (unlocked ? <Badge tone="ok">Unlocked</Badge> : <Badge>Locked</Badge>)}
        {!wallet.backedUp && <Badge tone="bad">Not backed up</Badge>}
        <div className="ml-auto flex gap-1">
          {hasKeys && !unlocked && (
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setMode('unlock')}>
              <Unlock className="h-3.5 w-3.5" /> Unlock
            </button>
          )}
          {hasKeys && (
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setMode('reveal')}>
              <Eye className="h-3.5 w-3.5" /> Reveal secret
            </button>
          )}
          <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => w.setArchived(wallet.id, !wallet.archived)}>
            {wallet.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            {wallet.archived ? 'Restore' : 'Archive'}
          </button>
          {wallet.archived && (
            <button
              className="btn-ghost px-2.5 py-1.5 text-xs text-bad"
              onClick={() => {
                if (confirm(`Delete "${wallet.name}" from this device? Without your recovery phrase or key, funds cannot be recovered.`)) w.deleteWallet(wallet.id)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-white/[0.05]">
        {wallet.accounts.map((a) => {
          const active = w.activeWallet?.id === wallet.id && w.activeAccount?.index === a.index
          return (
            <li key={a.index} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <input
                className="w-40 bg-transparent font-medium outline-none focus:underline"
                defaultValue={a.label}
                onBlur={(e) => e.target.value.trim() && w.renameAccount(wallet.id, a.index, e.target.value.trim())}
                aria-label="Account label"
              />
              <span className="font-mono text-xs text-mute">{shortAddress(a.address, 6)}</span>
              <CopyButton value={a.address} />
              {!wallet.archived && (
                <button className={cx('ml-auto chip', active && 'border-lime/40 text-lime')} onClick={() => w.setActive(wallet.id, a.index)}>
                  {active ? 'Active' : 'Use'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {wallet.kind === 'mnemonic' && !wallet.archived && (
        <button
          className="btn-ghost mt-2 px-3 py-1.5 text-xs"
          disabled={!unlocked}
          title={unlocked ? '' : 'Unlock to derive accounts'}
          onClick={() => {
            try {
              w.addAccount(wallet.id)
            } catch (e) {
              setErr((e as Error).message)
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add account
        </button>
      )}
      {err && !mode && <div className="mt-2"><ErrorBox>{err}</ErrorBox></div>}

      <Modal
        open={!!mode}
        onClose={() => {
          setMode(null)
          setSecret(null)
          setErr(null)
        }}
        title={mode === 'unlock' ? `Unlock ${wallet.name}` : 'Reveal secret'}
      >
        {secret ? (
          <div className="space-y-3">
            <Notice tone="warn">Anyone who sees this controls your funds. Close this window when done.</Notice>
            <p className="break-words rounded-xl bg-ink-900 p-4 font-mono text-sm">{secret.kind === 'mnemonic' ? secret.phrase : secret.privateKey}</p>
            {!wallet.backedUp && (
              <button
                className="btn-primary w-full"
                onClick={() => {
                  w.markBackedUp(wallet.id)
                  setSecret(null)
                  setMode(null)
                }}
              >
                I have written it down
              </button>
            )}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {mode === 'reveal' && <Notice tone="warn">InWIF staff will never ask for this. Make sure no one can see your screen.</Notice>}
            <label className="label" htmlFor={`pw-${wallet.id}`}>
              <KeyRound className="mr-1 inline h-3 w-3" /> Wallet password
            </label>
            <input id={`pw-${wallet.id}`} type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            {err && <ErrorBox>{err}</ErrorBox>}
            <button className="btn-primary w-full" disabled={!pw}>
              {mode === 'unlock' ? 'Unlock' : 'Reveal'}
            </button>
          </form>
        )}
      </Modal>
    </section>
  )
}
