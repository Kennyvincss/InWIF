'use client'
import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { useWallet } from '@/lib/wallet-store'
import { useUsername } from '@/lib/usernames'
import { disableSignin, enableSignin, useRefreshSigninStatus, useSigninStatus } from '@/lib/signin'
import { Badge, ErrorBox, Spinner } from './ui'

/** Settings: turn "sign in with @username + password" on or off for the active account. */
export function SigninCard() {
  const { activeWallet, activeAccount, isUnlocked, unlock, softwareSignerFor } = useWallet()
  const address = activeAccount?.address
  const name = useUsername(address)
  const status = useSigninStatus(address)
  const refresh = useRefreshSigninStatus()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!activeWallet || !activeAccount || !address) return null
  const software = activeWallet.kind === 'mnemonic' || activeWallet.kind === 'privateKey'
  const on = status.data?.enabled

  async function run(action: 'on' | 'off') {
    if (!activeWallet || !activeAccount || !address) return
    setErr(null)
    setBusy(true)
    try {
      if (!isUnlocked(activeWallet.id)) await unlock(activeWallet.id, pw).catch(() => Promise.reject(new Error('Wrong password.')))
      const sign = (m: string) => softwareSignerFor(activeWallet.id, activeAccount.index).signMessage!(m)
      if (action === 'on') {
        await enableSignin({
          address,
          index: activeAccount.index,
          kind: activeWallet.kind as 'mnemonic' | 'privateKey',
          name: activeWallet.name,
          vault: activeWallet.vault!,
          password: pw,
          sign,
        })
      } else await disableSignin(address, sign)
      setPw('')
      await refresh(address)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5" id="signin">
      <h2 className="mb-1 flex items-center gap-2 font-display font-bold">
        <LogIn className="h-5 w-5 text-accent" /> Sign in with username
        {on && <Badge tone="ok">On</Badge>}
      </h2>
      {!software ? (
        <p className="text-sm text-mute">Only wallets created or imported in InWIF can sign in with a username.</p>
      ) : !name.data ? (
        <p className="text-sm text-mute">Claim a username above first. Then you can sign in on any device with it and your password.</p>
      ) : status.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-mute"><Spinner /> Checking…</p>
      ) : on ? (
        <div className="space-y-3">
          <p className="text-sm text-mute" data-testid="signin-on">
            On any device, open InWIF, choose <b className="text-fg">Sign in with @username</b> and use <b className="text-fg">@{name.data.username}</b> and your password.
          </p>
          {!isUnlocked(activeWallet.id) && (
            <input type="password" className="input" placeholder="Wallet password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Wallet password" />
          )}
          {err && <ErrorBox>{err}</ErrorBox>}
          <button className="btn-ghost" disabled={busy || (!isUnlocked(activeWallet.id) && !pw)} onClick={() => void run('off')}>
            {busy ? <Spinner /> : null} Turn off and delete the online copy
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-mute">
            Sign in on any device with <b className="text-fg">@{name.data.username}</b> and your password, without importing your recovery phrase. Your wallet is stored
            encrypted with your password; InWIF never receives the password or your recovery phrase. Use a strong password: anyone who learns it and your username could
            open your wallet.
          </p>
          <div>
            <label className="label" htmlFor="si-enable-pw">Wallet password</label>
            <input id="si-enable-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </div>
          {err && <ErrorBox>{err}</ErrorBox>}
          <button className="btn-primary" disabled={busy || !pw} onClick={() => void run('on')}>
            {busy ? <Spinner /> : <LogIn className="h-4 w-4" />} Turn on sign-in
          </button>
        </div>
      )}
    </section>
  )
}
