'use client'
import { useMemo, useState } from 'react'
import { encodeFunctionData, erc20Abi, formatUnits, type Address } from 'viem'
import { ArrowUpRight } from 'lucide-react'
import { checkRecipient, parseAmount } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useNetwork, usePortfolio, useTokens } from '@/lib/hooks'
import { fmtToken, fmtUsd } from '@/lib/format'
import { TxFlow, type TxRequest } from '@/components/TxFlow'
import { ErrorBox, Findings, Notice, PageHeader, PercentButtons, TokenPicker } from '@/components/ui'
import { percentOf, useGasReserve } from '@/lib/amount'

export default function SendPage() {
  const { activeAccount, activeWallet, state } = useWallet()
  const { network } = useNetwork()
  const tokens = useTokens()
  const { rows } = usePortfolio(activeAccount?.address)
  const [asset, setAsset] = useState('native')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [req, setReq] = useState<TxRequest | null>(null)

  const row = rows.find((r) => r.key === asset)
  // A plain ETH transfer uses 21,000 gas; keep its fee back when filling from the ETH balance.
  const reserve = useGasReserve(21_000n)
  const available = row ? (asset === 'native' ? (reserve === undefined ? undefined : row.raw > reserve ? row.raw - reserve : 0n) : row.raw) : undefined
  const decimals = row?.decimals ?? 18
  const recipient = useMemo(
    () =>
      to
        ? checkRecipient(to, {
            self: activeAccount?.address,
            knownTokens: tokens.map((t) => t.address),
            blocklist: new Set(state.blocklist),
          })
        : null,
    [to, activeAccount, tokens, state.blocklist],
  )
  const amt = amount ? parseAmount(amount, decimals, row?.raw) : null
  const usd = amt?.raw !== undefined && row?.priceUsd ? Number(formatUnits(amt.raw, decimals)) * row.priceUsd : null
  const ready = recipient?.ok && amt?.ok && activeWallet?.kind !== 'watch'

  function review() {
    if (!recipient?.address || !amt?.raw || !row) return
    const summary = `Send ${amount} ${row.symbol}`
    if (asset === 'native') setReq({ to: recipient.address, value: amt.raw, summary, kind: 'send' })
    else
      setReq({
        to: asset as Address,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient.address, amt.raw] }),
        summary,
        kind: 'send',
      })
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Send" subtitle={`On ${network.name}. You will review every detail and the network fee before signing.`} />
      <div className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="asset">Asset</label>
          <TokenPicker
            label="Asset"
            value={asset}
            onChange={(k) => {
              setAsset(k)
              setAmount('')
            }}
            options={rows.map((r) => ({ key: r.key, symbol: r.symbol, detail: fmtToken(r.raw, r.decimals) }))}
          />
          {row && <p className="mt-1 text-xs text-mute">Balance {fmtToken(row.raw, row.decimals)} {row.symbol}</p>}
        </div>
        <div>
          <label className="label" htmlFor="to">Recipient address</label>
          <input id="to" className="input font-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" />
          {recipient && (
            <div className="mt-2">
              <Findings findings={recipient.findings} />
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0" htmlFor="amt">Amount</label>
            <PercentButtons disabled={!row || available === undefined || available === 0n} onPick={(p) => row && available !== undefined && setAmount(percentOf(available, row.decimals, p, asset !== 'native'))} />
          </div>
          <input id="amt" className="input text-lg" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="mt-1 flex justify-between text-xs text-mute">
            <span>{usd !== null ? `≈ ${fmtUsd(usd)}` : ' '}</span>
            {amt && !amt.ok && <span className="text-bad">{amt.error}</span>}
          </div>
          {asset === 'native' && <p className="mt-1 text-xs text-mute">100% keeps a little ETH back for the network fee. The review shows the exact fee.</p>}
        </div>
        {activeWallet?.kind === 'watch' && <ErrorBox>Watch-only wallets cannot send.</ErrorBox>}
        <Notice>Sending is free in InWIF. You only pay the {network.name} network fee, shown before you confirm.</Notice>
        <button className="btn-primary w-full" disabled={!ready} onClick={review}>
          <ArrowUpRight className="h-4 w-4" /> Review transaction
        </button>
      </div>
      <TxFlow
        request={req}
        onClose={() => setReq(null)}
        onDone={(_, ok) => {
          if (ok) {
            setAmount('')
            setTo('')
          }
        }}
      />
    </div>
  )
}
