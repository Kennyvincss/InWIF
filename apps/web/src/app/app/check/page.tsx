'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Info, ScanSearch, ShieldAlert, XCircle } from 'lucide-react'
import { analyzeToken, explorerTokenUrl, fetchTokenHolders, normaliseTokenAddress, type TokenReport } from '@inwif/core'
import { useNetwork, useTokens } from '@/lib/hooks'
import { withExplorer } from '@/lib/net'
import { ErrorBox, FieldHint, Notice, PageHeader, Spinner, TokenIcon, cx } from '@/components/ui'

const VERDICT = {
  low: { label: 'Low risk', tone: 'text-accent', ring: 'border-accent/30 bg-accent/[0.06]', icon: CheckCircle2, text: 'No red flags found in these checks.' },
  medium: { label: 'Be careful', tone: 'text-warn', ring: 'border-warn/30 bg-warn/[0.06]', icon: AlertTriangle, text: 'Some warning signs. Read the findings before buying.' },
  high: { label: 'High risk', tone: 'text-bad', ring: 'border-bad/30 bg-bad/[0.07]', icon: ShieldAlert, text: 'Serious red flags. We would not buy this.' },
} as const

const ITEM = {
  ok: { icon: CheckCircle2, tone: 'text-accent' },
  warn: { icon: AlertTriangle, tone: 'text-warn' },
  danger: { icon: XCircle, tone: 'text-bad' },
  info: { icon: Info, tone: 'text-mute' },
} as const

export default function TokenCheckPage() {
  const { network, client } = useNetwork()
  const tokens = useTokens()
  const [input, setInput] = useState('')
  const address = normaliseTokenAddress(input)

  const check = useMutation({
    mutationFn: async (token: `0x${string}`): Promise<TokenReport> => {
      const holders = network.explorer.apiV2 ? await withExplorer(network.key, (n) => fetchTokenHolders(n, token)).catch(() => null) : null
      return analyzeToken(client, network, token, { known: tokens, holders })
    },
  })
  const run = (token?: string) => {
    const a = normaliseTokenAddress(token ?? input)
    if (a) {
      if (token) setInput(token)
      check.mutate(a)
    }
  }
  const r = check.data
  const v = r ? VERDICT[r.verdict] : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Token check" subtitle={`Is a token on ${network.name} safe to buy? Paste its address and InWIF tests it for the most common scams.`} />

      <section className="card p-6">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
        >
          <input className="input font-mono" placeholder="0x… token address" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Token address" spellCheck={false} autoComplete="off" />
          <button className="btn-primary shrink-0" disabled={!address || check.isPending}>
            {check.isPending ? <Spinner /> : <ScanSearch className="h-4 w-4" />} Check token
          </button>
        </form>
        {input && !address && <FieldHint tone="danger" className="mt-2">That is not a valid token address.</FieldHint>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] uppercase tracking-[0.04em] text-[#9095A4] font-medium">Try</span>
          {tokens.slice(0, 4).map((t) => (
            <button key={t.address} type="button" className="chip hover:border-white/20 hover:text-white" onClick={() => run(t.address)}>
              <TokenIcon symbol={t.symbol} size={14} /> {t.symbol}
            </button>
          ))}
        </div>
      </section>

      {check.isPending && (
        <section className="card flex items-center gap-3 p-6 text-sm text-mute">
          <Spinner className="text-accent" /> Testing the token: reading the contract, checking holders, simulating a transfer and a sale…
        </section>
      )}
      {check.isError && <ErrorBox>The check could not finish: {(check.error as Error).message}</ErrorBox>}

      {r && v && (
        <>
          <section className={cx('card border p-6', v.ring)}>
            <div className="flex flex-wrap items-center gap-4">
              <span className={cx('grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-ink-900', v.tone)}>
                <v.icon className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx('font-display text-2xl font-semibold', v.tone)}>{v.label}</p>
                <p className="text-sm text-mute">{v.text}</p>
              </div>
              {r.meta && (
                <div className="text-right">
                  <p className="font-medium">{r.meta.symbol}</p>
                  <p className="max-w-[14rem] truncate text-xs text-dim">{r.meta.name}</p>
                </div>
              )}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                { k: 'Transfer tax', v: r.transferTaxPct === null ? '—' : `${r.transferTaxPct}%` },
                { k: 'Top holder', v: r.top1Pct === null ? '—' : `${r.top1Pct.toFixed(1)}%` },
                { k: 'Top 10', v: r.top10Pct === null ? '—' : `${r.top10Pct.toFixed(1)}%` },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-white/[0.07] bg-ink-900 p-3">
                  <p className="text-[11.5px] uppercase tracking-[0.04em] text-[#9095A4] font-medium">{s.k}</p>
                  <p className="mt-1 font-medium">{s.v}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card divide-y divide-white/[0.06] p-2">
            {r.items.map((i) => {
              const s = ITEM[i.level]
              return (
                <div key={i.id} className="flex gap-3 px-4 py-4">
                  <s.icon className={cx('mt-0.5 h-5 w-5 shrink-0', s.tone)} />
                  <div className="min-w-0">
                    <p className="font-medium">{i.title}</p>
                    <p className="mt-0.5 break-words text-sm text-mute">{i.detail}</p>
                  </div>
                </div>
              )
            })}
          </section>
          {explorerTokenUrl(network, r.token) && (
            <a className="inline-block text-xs text-dim transition hover:text-white" href={explorerTokenUrl(network, r.token)} target="_blank" rel="noreferrer">
              View this token on the explorer ↗
            </a>
          )}
        </>
      )}

      <Notice>
        These checks catch common scams — copycats, tokens you cannot sell, hidden taxes and wallets that own most of the supply. A clean result is not a guarantee: only buy what you can afford to lose.
      </Notice>
    </div>
  )
}
