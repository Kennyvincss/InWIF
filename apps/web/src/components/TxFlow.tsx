'use client'
/**
 * The single path every InWIF transaction goes through:
 *   live network check → fee estimate → simulation → decoded review →
 *   explicit user confirmation → sign (software or hardware) → broadcast →
 *   wait for the real on-chain receipt.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatUnits, type Address, type Hex } from 'viem'
import { CheckCircle2, ExternalLink, Lock, ShieldCheck, Usb, XCircle } from 'lucide-react'
import {
  describeChange,
  estimateFees,
  explorerTxUrl,
  hardwareSigner,
  prepareTransaction,
  reviewTransaction,
  signAndBroadcast,
  simulateTransaction,
  type FeeEstimate,
  type SignerHandle,
  type SimulationResult,
  type TxReview,
} from '@inwif/core'
import { useNetwork, useTokens, useVerification } from '@/lib/hooks'
import { useWallet } from '@/lib/wallet-store'
import { useHardware } from '@/lib/hardware'
import { useNotify } from '@/lib/notifications'
import { Badge, ErrorBox, Findings, Modal, Notice, Row, Spinner, cx } from './ui'

export interface TxRequest {
  to: Address
  value?: bigint
  data?: Hex
  /** Short label for notifications, e.g. "Send 10 WIF". */
  summary: string
  kind?: 'send' | 'swap' | 'approve' | 'revoke' | 'other'
}

type Phase = 'review' | 'signing' | 'pending' | 'done' | 'failed'

export function TxFlow({ request, onClose, onDone }: { request: TxRequest | null; onClose: () => void; onDone?: (hash: Hex, ok: boolean) => void }) {
  const { activeWallet, activeAccount, state, isUnlocked, unlock, softwareSignerFor } = useWallet()
  const { network, client } = useNetwork()
  const verification = useVerification()
  const tokens = useTokens()
  const hwCtx = useHardware()
  const notify = useNotify()
  const qc = useQueryClient()

  const [fees, setFees] = useState<FeeEstimate | null>(null)
  const [sim, setSim] = useState<SimulationResult | null>(null)
  const [nativeBal, setNativeBal] = useState<bigint | undefined>()
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<Phase>('review')
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<Hex | null>(null)

  const from = activeAccount?.address

  useEffect(() => {
    if (!request || !from) return
    setFees(null)
    setSim(null)
    setLoadErr(null)
    setConfirmed(false)
    setPhase('review')
    setError(null)
    setHash(null)
    hwCtx.resetSteps()
    const req = { from, to: request.to, value: request.value, data: request.data }
    Promise.all([simulateTransaction(client, req), client.getBalance({ address: from })])
      .then(async ([s, bal]) => {
        setSim(s)
        setNativeBal(bal)
        if (s.success) setFees(await estimateFees(client, req))
      })
      .catch((e) => setLoadErr((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, from, client])

  const review: TxReview | null = useMemo(() => {
    if (!request || !from) return null
    const decimals: Record<string, number> = {}
    const symbols: Record<string, string> = {}
    const known: Record<string, string> = {}
    for (const t of tokens) {
      decimals[t.address.toLowerCase()] = t.decimals
      symbols[t.address.toLowerCase()] = t.symbol
      known[t.address.toLowerCase()] = `${t.symbol} token`
    }
    if (network.uniswapV3) {
      known[network.uniswapV3.swapRouter02.toLowerCase()] = 'Uniswap V3 SwapRouter02'
      known[network.uniswapV3.weth9.toLowerCase()] = 'WETH'
    }
    return reviewTransaction(
      { to: request.to, value: request.value, data: request.data, chainId: network.chainId },
      {
        from,
        expectedChainId: network.chainId,
        nativeBalance: nativeBal,
        maxFeeWei: fees?.maxFeeWei,
        blocklist: new Set(state.blocklist),
        knownContracts: known,
        tokenDecimals: decimals,
        tokenSymbols: symbols,
      },
    )
  }, [request, from, tokens, network, nativeBal, fees, state.blocklist])

  if (!request) return null
  const isHardware = activeWallet?.kind === 'hardware'
  const isWatch = activeWallet?.kind === 'watch'
  const locked = !isHardware && !isWatch && !isUnlocked(activeWallet?.id)
  const verified = verification.data?.ok === true
  const blocked = review?.findings.some((f) => f.code.startsWith('flagged') || f.code === 'chain-mismatch' || f.code === 'insufficient-native')
  const canSign = verified && !!fees && sim?.success && confirmed && !blocked && !isWatch && (!locked || password.length > 0)

  async function go() {
    if (!activeWallet || !activeAccount || !fees || !request) return
    setError(null)
    setPhase('signing')
    try {
      if (locked) await unlock(activeWallet.id, password)
      let signer: SignerHandle
      if (isHardware) {
        if (!hwCtx.hw) throw new Error('Connect your InWIF device (or the simulator) first — open Hardware.')
        const devAddr = await hwCtx.hw.getAddress(activeAccount.index)
        if (devAddr !== activeAccount.address) throw new Error('The connected device does not hold this account.')
        signer = hardwareSigner(hwCtx.hw, activeAccount.index, activeAccount.address)
        hwCtx.logStep(1, 'Companion built the unsigned transaction')
        hwCtx.logStep(2, 'Transaction sent to the device over the transport')
      } else {
        signer = softwareSignerFor(activeWallet.id, activeAccount.index)
      }
      const prepared = await prepareTransaction(client, network, activeAccount.address, {
        to: request.to,
        value: request.value,
        data: request.data,
        gas: fees.gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      })
      // Re-verify the network right before signing.
      const v = await verification.refetch()
      const h = await signAndBroadcast(client, prepared, signer, { confirmed, verification: v.data ?? null })
      if (isHardware) {
        hwCtx.logStep(6, 'Device signed internally — private key never left it')
        hwCtx.logStep(7, 'Signature returned and verified by the companion')
        hwCtx.logStep(8, 'Companion broadcast the signed transaction')
      }
      setHash(h)
      setPhase('pending')
      const receipt = await client.waitForTransactionReceipt({ hash: h, timeout: 180_000 })
      const ok = receipt.status === 'success'
      setPhase(ok ? 'done' : 'failed')
      notify.push({
        type: ok ? (request.kind === 'swap' ? 'swaps' : 'outgoing') : 'failed',
        title: ok ? `Confirmed: ${request.summary}` : `Failed on-chain: ${request.summary}`,
        body: `Block ${receipt.blockNumber.toString()}`,
        href: explorerTxUrl(network, h),
      })
      void qc.invalidateQueries()
      onDone?.(h, ok)
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message
      setError(msg)
      setPhase(hash ? 'failed' : 'review')
    }
  }

  return (
    <Modal open={!!request} onClose={phase === 'signing' || phase === 'pending' ? () => {} : onClose} title={review?.title ?? 'Review transaction'}>
      {phase === 'done' || phase === 'failed' || phase === 'pending' ? (
        <div className="space-y-4 text-center">
          {phase === 'pending' && <Spinner className="mx-auto h-10 w-10 text-lime" />}
          {phase === 'done' && <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />}
          {phase === 'failed' && <XCircle className="mx-auto h-12 w-12 text-bad" />}
          <p className="font-display text-lg font-bold">
            {phase === 'pending' ? 'Waiting for confirmation…' : phase === 'done' ? 'Confirmed on-chain' : 'Transaction failed'}
          </p>
          <p className="text-sm text-mute">
            {phase === 'pending' ? 'Broadcast to the network. This updates when a block includes it.' : 'Status read from the transaction receipt.'}
          </p>
          {error && <ErrorBox>{error}</ErrorBox>}
          {hash && explorerTxUrl(network, hash) && (
            <a className="btn-ghost w-full" href={explorerTxUrl(network, hash)} target="_blank" rel="noreferrer">
              View on {network.explorer.name} <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {phase !== 'pending' && (
            <button className="btn-primary w-full" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {verification.isLoading ? (
              <Badge>Checking network…</Badge>
            ) : verified ? (
              <Badge tone="ok">
                <ShieldCheck className="h-3 w-3" /> {network.name} verified · chain {network.chainId}
              </Badge>
            ) : (
              <Badge tone="bad">Network not verified — signing disabled</Badge>
            )}
            {review && <Badge tone={review.risk === 'high' ? 'bad' : review.risk === 'medium' ? 'warn' : 'ok'}>Risk: {review.risk}</Badge>}
            {isHardware && (
              <Badge tone="lime">
                <Usb className="h-3 w-3" /> Hardware signing
              </Badge>
            )}
          </div>

          {!verified && verification.data && !verification.data.ok && <ErrorBox>{verification.data.reason}</ErrorBox>}

          <div className="rounded-xl bg-ink-900 px-4 py-1">
            <Row label="From">
              <span className="mono text-xs">{from}</span>
            </Row>
            {review?.lines.map((l) => (
              <Row key={l.label} label={l.label}>
                <span className={cx(l.value.startsWith('0x') && 'mono text-xs', l.value === 'UNLIMITED' && 'font-bold text-bad')}>{l.value}</span>
              </Row>
            ))}
            {fees && (
              <Row label="Estimated network fee">
                {formatUnits(fees.expectedFeeWei, 18).slice(0, 12)} ETH <span className="text-mute">(gas {fees.gas.toString()})</span>
              </Row>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.06] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Simulation</p>
            {!sim && !loadErr && (
              <p className="flex items-center gap-2 text-sm text-mute">
                <Spinner /> Simulating against the latest block…
              </p>
            )}
            {loadErr && <ErrorBox>{loadErr}</ErrorBox>}
            {sim && !sim.success && <ErrorBox>This transaction would fail: {sim.revertReason}</ErrorBox>}
            {sim?.success && (
              <div className="space-y-1 text-sm">
                <p className="text-ok">Would succeed at the current block ({sim.method === 'simulateV1' ? 'full simulation' : 'revert check'}).</p>
                {sim.assetChanges.map((c, i) => (
                  <p key={i} className={c.diff < 0n ? 'text-bad' : 'text-ok'}>
                    {describeChange(c)}
                  </p>
                ))}
                {sim.notes.map((n) => (
                  <p key={n} className="text-xs text-mute">
                    {n}
                  </p>
                ))}
              </div>
            )}
          </div>

          {review && <Findings findings={review.findings} />}

          {isWatch && <ErrorBox>This is a watch-only wallet. It cannot sign transactions.</ErrorBox>}

          {locked && (
            <div>
              <label className="label" htmlFor="tx-pw">
                <Lock className="mr-1 inline h-3 w-3" /> Wallet password
              </label>
              <input id="tx-pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#A6F36A]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              I have checked the recipient, amounts and network fee. I understand blockchain transactions are irreversible.
              {isHardware && ' I will verify the same details on my device screen.'}
            </span>
          </label>

          {error && <ErrorBox>{error}</ErrorBox>}

          <Notice>InWIF charges no fees. The only cost is the network fee shown above{request.kind === 'swap' ? ' plus the Uniswap pool fee shown on the swap screen' : ''}.</Notice>

          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={onClose} disabled={phase === 'signing'}>
              Cancel
            </button>
            <button className="btn-primary flex-1" disabled={!canSign || phase === 'signing'} onClick={go}>
              {phase === 'signing' ? (
                <>
                  <Spinner /> {isHardware ? 'Confirm on device…' : 'Signing…'}
                </>
              ) : isHardware ? (
                'Send to device'
              ) : (
                'Sign & send'
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
