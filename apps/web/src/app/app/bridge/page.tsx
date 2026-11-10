'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatEther, type Address, type Hex } from 'viem'
import { ArrowDown, CheckCircle2, Clock, ExternalLink, Loader2 } from 'lucide-react'
import { NETWORKS, ROBINHOOD_L1_BRIDGE, buildDepositTx, estimateDepositFees, getPublicClient, maxDepositable, parseAmount, shortAddress } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { usePortfolio } from '@/lib/hooks'
import { etherscanTx, useBridgeVerification, useEthereumBalance, useEthereumClient } from '@/lib/ethereum'
import { fmtUsd } from '@/lib/format'
import { percentOf } from '@/lib/amount'
import { browserNetwork } from '@/lib/net'
import { Callout, ErrorBox, FieldHint, Modal, PageHeader, PercentButtons, Row, Spinner, TokenIcon, cx } from '@/components/ui'

const fmtEth = (wei: bigint | undefined) => (wei === undefined ? '—' : Number(formatEther(wei)).toLocaleString('en-US', { maximumFractionDigits: 8 }))

type Phase = 'review' | 'signing' | 'sent' | 'confirmed' | 'arrived' | 'failed'

export default function BridgePage() {
  const { activeWallet, activeAccount, state, update, isUnlocked, unlock, softwareSignerFor } = useWallet()
  const address = activeAccount?.address
  const l1 = useEthereumClient()
  const l1Balance = useEthereumBalance(address)
  const verification = useBridgeVerification()
  const { rows } = usePortfolio(address)
  const ethPrice = rows.find((r) => r.key === 'native')?.priceUsd ?? null
  const robinhood = useMemo(() => getPublicClient(browserNetwork('robinhood')), [])

  const [amount, setAmount] = useState('')
  const [fees, setFees] = useState<Awaited<ReturnType<typeof estimateDepositFees>> | null>(null)
  const [feeErr, setFeeErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('review')
  const [pw, setPw] = useState('')
  const [checked, setChecked] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hash, setHash] = useState<Hex | null>(null)
  const baseline = useRef<bigint>(0n)
  const [sent, setSent] = useState<bigint | null>(null)

  const balance = l1Balance.data
  const canSign = activeWallet?.kind === 'mnemonic' || activeWallet?.kind === 'privateKey'
  const available = balance !== undefined && fees ? maxDepositable(balance, fees) : undefined
  const amt = amount ? parseAmount(amount, 18, available) : null
  const usd = (wei?: bigint) => (wei !== undefined && ethPrice ? fmtUsd(Number(formatEther(wei)) * ethPrice) : null)

  // Fee estimate (refreshes with the amount and every 30 s).
  useEffect(() => {
    if (!address) return
    let stop = false
    const run = () =>
      estimateDepositFees(l1, address, amt?.ok && amt.raw ? amt.raw : 0n)
        .then((f) => !stop && (setFees(f), setFeeErr(null)))
        .catch((e) => !stop && setFeeErr((e as Error).message))
    run()
    const t = setInterval(run, 30_000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [address, l1, amt?.raw]) // eslint-disable-line react-hooks/exhaustive-deps

  // After the Ethereum transaction confirms, wait for the ETH to land on Robinhood Chain.
  useEffect(() => {
    if (phase !== 'confirmed' || !address || !sent) return
    const want = baseline.current + sent
    const t = setInterval(async () => {
      try {
        if ((await robinhood.getBalance({ address })) >= want - want / 1000n) setPhase('arrived')
      } catch {
        /* keep waiting */
      }
    }, 10_000)
    return () => clearInterval(t)
  }, [phase, address, sent, robinhood])

  async function send() {
    if (!activeWallet || !activeAccount || !address || !amt?.ok || !amt.raw || !fees) return
    setErr(null)
    try {
      if (!isUnlocked(activeWallet.id)) await unlock(activeWallet.id, pw)
      setPhase('signing')
      const check = await verification.refetch()
      if (!check.data?.ok) throw new Error(check.data && !check.data.ok ? check.data.reason : 'Could not verify the bridge.')
      const tx = buildDepositTx(amt.raw)
      const fresh = await estimateDepositFees(l1, address, amt.raw)
      const bal = await l1.getBalance({ address })
      if (amt.raw + fresh.maxFeeWei > bal) throw new Error('Not enough ETH on Ethereum to cover the amount and the network fee. Try a smaller amount.')
      await l1.call({ account: address, ...tx }) // simulate: refuses anything that would fail
      const signer = softwareSignerFor(activeWallet.id, activeAccount.index)
      if (signer.address.toLowerCase() !== address.toLowerCase()) throw new Error('Signer does not match this account.')
      const nonce = await l1.getTransactionCount({ address, blockTag: 'pending' })
      const raw = await signer.signTransaction({
        type: 'eip1559',
        chainId: 1,
        nonce,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        gas: fresh.gas,
        maxFeePerGas: fresh.maxFeePerGas,
        maxPriorityFeePerGas: fresh.maxPriorityFeePerGas,
      })
      baseline.current = await robinhood.getBalance({ address }).catch(() => 0n)
      const h = await l1.sendRawTransaction({ serializedTransaction: raw })
      setHash(h)
      setSent(amt.raw)
      setAmount('')
      setPhase('sent')
      update((s) => ({ ...s, l1Deposits: [{ hash: h, address, amount: tx.value.toString(), at: Date.now() }, ...(s.l1Deposits ?? [])].slice(0, 20) }))
      const receipt = await l1.waitForTransactionReceipt({ hash: h, timeout: 15 * 60_000 })
      if (receipt.status !== 'success') throw new Error('The Ethereum transaction failed. No ETH was moved; only the network fee was spent.')
      setPhase('confirmed')
      l1Balance.refetch()
    } catch (e) {
      setErr((e as { shortMessage?: string }).shortMessage ?? (e as Error).message)
      setPhase(hash ? 'failed' : 'review')
    }
  }

  const deposits = (state.l1Deposits ?? []).filter((d) => d.address === address)

  if (!address) return null
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Move ETH from Ethereum" subtitle="Bring ETH you hold on Ethereum over to Robinhood Chain through its official bridge. It arrives at your same address in about 10 minutes." />

      <section className="card space-y-5 p-6">
        <div className="rounded-2xl bg-ink-900 p-4">
          <p className="label mb-1">From · Ethereum</p>
          <div className="flex items-center gap-3">
            <TokenIcon symbol="ETH" size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold" data-testid="l1-balance">{l1Balance.isLoading ? <Spinner /> : `${fmtEth(balance)} ETH`}</p>
              <p className="text-xs text-dim">{l1Balance.isError ? 'Could not reach Ethereum right now.' : usd(balance) ?? ' '}</p>
            </div>
          </div>
        </div>
        <div className="-my-3 flex justify-center">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-accent">
            <ArrowDown className="h-4 w-4" />
          </span>
        </div>
        <div className="rounded-2xl bg-ink-900 p-4">
          <p className="label mb-1">To · Robinhood Chain</p>
          <div className="flex items-center gap-3">
            <TokenIcon symbol="ETH" size={34} />
            <p className="min-w-0 flex-1 text-sm text-mute">
              Your same address <span className="font-mono text-fg">{shortAddress(address)}</span>
            </p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0" htmlFor="bridge-amt">Amount</label>
            <PercentButtons disabled={!available} onPick={(p) => available && setAmount(percentOf(available, 18, p, true))} />
          </div>
          <input id="bridge-amt" className="input mt-2 text-lg" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="mt-1.5 flex justify-between text-xs text-mute">
            <span>{amt?.raw ? usd(amt.raw) ?? ' ' : ' '}</span>
            {amt && !amt.ok && <span className="text-bad">{amt.error === 'Insufficient balance.' ? 'More than you can move after the network fee.' : amt.error}</span>}
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-mute">Ethereum network fee</span>
            <span>{fees ? `≈ ${fmtEth(fees.expectedFeeWei)} ETH${usd(fees.expectedFeeWei) ? ` (${usd(fees.expectedFeeWei)})` : ''}` : feeErr ? '—' : <Spinner />}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-mute">Fee on Robinhood Chain</span>
            <span>None</span>
          </div>
          <div className="flex justify-between">
            <span className="text-mute">Arrives in</span>
            <span>About 10 minutes</span>
          </div>
        </div>

        {verification.data?.ok ? (
          <FieldHint tone="ok">Official Robinhood Chain bridge, checked on Ethereum just now.</FieldHint>
        ) : verification.data ? (
          <ErrorBox>Bridging is unavailable: {verification.data.reason}</ErrorBox>
        ) : (
          <FieldHint>Checking the bridge on Ethereum…</FieldHint>
        )}
        {!canSign && <ErrorBox>{activeWallet?.kind === 'watch' ? 'Watch-only wallets cannot move funds.' : 'Bridging from a hardware wallet is not available yet.'}</ErrorBox>}
        {balance === 0n && <Callout tone="info">You have no ETH on Ethereum at this address. ETH sent to you on Ethereum will show up here.</Callout>}

        <button
          className="btn-primary h-14 w-full text-base"
          disabled={!canSign || !amt?.ok || !fees || !verification.data?.ok}
          onClick={() => {
            setPhase('review')
            setErr(null)
            setChecked(false)
            setOpen(true)
          }}
        >
          Review move
        </button>
      </section>

      {deposits.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-2 font-display font-bold">Recent moves</h2>
          <ul className="divide-y divide-line">
            {deposits.map((d) => (
              <li key={d.hash} className="flex items-center gap-3 py-2.5 text-sm">
                <Clock className="h-4 w-4 text-dim" />
                <span className="flex-1">
                  {fmtEth(BigInt(d.amount))} ETH · {new Date(d.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <a className="flex items-center gap-1 text-xs text-mute hover:text-fg" href={etherscanTx(d.hash)} target="_blank" rel="noreferrer">
                  On Ethereum <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Callout>Moving ETH back from Robinhood Chain to Ethereum takes about 7 days on the official bridge and is not in InWIF yet.</Callout>

      <Modal open={open} onClose={() => phase !== 'signing' && phase !== 'sent' && setOpen(false)} title={phase === 'arrived' ? 'Arrived' : 'Move ETH to Robinhood Chain'}>
        {phase === 'review' || phase === 'signing' ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-ink-900 px-4 py-1">
              <Row label="From">
                <span className="font-mono text-xs">{address}</span>
              </Row>
              <Row label="Network">Ethereum</Row>
              <Row label="To">
                <span className="block">Robinhood Chain official bridge</span>
                <span className="font-mono text-xs text-mute">{ROBINHOOD_L1_BRIDGE.inbox}</span>
              </Row>
              <Row label="Amount">{amount} ETH</Row>
              <Row label="Max network fee">{fees ? `${fmtEth(fees.maxFeeWei)} ETH` : '—'}</Row>
              <Row label="Arrives">Same address on {NETWORKS.robinhood.name}, in about 10 minutes</Row>
            </div>
            {activeWallet && !isUnlocked(activeWallet.id) && (
              <div>
                <label className="label" htmlFor="bridge-pw">Wallet password</label>
                <input id="bridge-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            <label className="flex items-start gap-2.5 text-sm text-mute">
              <input type="checkbox" className="mt-1 accent-[#E8622C]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              I understand this moves ETH from Ethereum to Robinhood Chain, and the Ethereum network fee is not refundable.
            </label>
            {err && <ErrorBox>{err}</ErrorBox>}
            <button className="btn-primary h-12 w-full" disabled={!checked || phase === 'signing' || (!!activeWallet && !isUnlocked(activeWallet.id) && !pw)} onClick={send}>
              {phase === 'signing' ? <Spinner /> : null} Sign & move
            </button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="bridge-status">
            {[
              { k: 'sent', t: 'Sent on Ethereum' },
              { k: 'confirmed', t: 'Confirmed on Ethereum' },
              { k: 'arrived', t: 'Arrived on Robinhood Chain' },
            ].map((s, i) => {
              // Index of the step being waited on: sent → confirming, confirmed → arriving, arrived → all done.
              const at = phase === 'arrived' ? 3 : phase === 'confirmed' ? 2 : 1
              const done = i < at
              const active = i === at && phase !== 'failed'
              return (
                <div key={s.k} className="flex items-center gap-3">
                  <span className={cx('grid h-8 w-8 place-items-center rounded-full', done ? 'bg-[#E3F3EA] text-ok' : active ? 'bg-accent-soft text-accent' : 'bg-ink-600 text-dim')}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                  </span>
                  <span className={cx('text-sm', done || active ? 'text-fg' : 'text-dim')}>{s.t}</span>
                </div>
              )
            })}
            {phase === 'confirmed' && <Callout tone="info">Your ETH is on its way. It usually lands within 10 minutes; you can close this window, it will arrive on its own.</Callout>}
            {phase === 'arrived' && <Callout tone="ok">Done. {fmtEth(sent ?? 0n)} ETH is now on Robinhood Chain and ready to pay fees in InWIF.</Callout>}
            {err && <ErrorBox>{err}</ErrorBox>}
            {hash && (
              <a className="inline-flex items-center gap-1 text-sm text-mute hover:text-fg" href={etherscanTx(hash)} target="_blank" rel="noreferrer">
                View on Ethereum <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {phase !== 'sent' && (
              <button className="btn-ghost w-full" onClick={() => setOpen(false)}>
                Close
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
