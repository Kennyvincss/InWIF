'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem'
import { Cable, Camera, ImageUp, Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { NETWORKS, parseTypedData, reviewPersonalSign, reviewTypedData, type SignReview } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useHardware } from '@/lib/hardware'
import { useTokens } from '@/lib/hooks'
import { METHOD_LABELS, RPC_ERRORS, useWalletConnect, type DappMeta, type PendingRequest, type VerifyInfo } from '@/lib/walletconnect'
import { TxFlow, type TxRequest } from './TxFlow'
import { QrScanner } from './QrScanner'
import { decodeQrFile, extractWcUri } from '@/lib/qr'
import { Badge, ErrorBox, Findings, Modal, Notice, Row, Spinner, cx } from './ui'

function DappHeader({ dapp, verify }: { dapp: DappMeta; verify: VerifyInfo }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-900 p-3">
      {dapp.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dapp.icon} alt="" width={40} height={40} className="rounded-xl bg-ink-700" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-700">
          <Cable className="h-5 w-5 text-mute" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{dapp.name}</p>
        <p className="truncate text-xs text-mute">{verify.origin || dapp.url}</p>
      </div>
      <VerifyBadge verify={verify} />
    </div>
  )
}

export function VerifyBadge({ verify }: { verify: VerifyInfo }) {
  if (verify.isScam) return <Badge tone="bad">Known scam</Badge>
  if (verify.validation === 'VALID') return <Badge tone="ok">Domain verified</Badge>
  if (verify.validation === 'INVALID') return <Badge tone="bad">Domain mismatch</Badge>
  return <Badge tone="warn">Unverified</Badge>
}

function VerifyNotice({ verify }: { verify: VerifyInfo }) {
  if (verify.isScam) return <ErrorBox>WalletConnect flags this site as a known scam. InWIF blocks it.</ErrorBox>
  if (verify.validation === 'INVALID')
    return <ErrorBox>The site&apos;s real address does not match the name it claims. This is a common phishing sign — do not continue unless you are sure.</ErrorBox>
  if (verify.validation === 'UNKNOWN') return <Notice tone="warn">WalletConnect could not verify this site&apos;s domain. Check the address above is the site you meant to use.</Notice>
  return null
}

/** Header button + dialog to paste a WalletConnect link. */
export function WcConnectButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="rounded-lg border border-white/10 p-2 hover:bg-white/5" aria-label="Connect an app" title="Connect an app (WalletConnect)" onClick={() => setOpen(true)}>
        <Cable className="h-4 w-4" />
      </button>
      <WcConnectModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function WcConnectModal({ open, onClose, initialUri = '' }: { open: boolean; onClose: () => void; initialUri?: string }) {
  const wc = useWalletConnect()
  const { activeWallet } = useWallet()
  const [uri, setUri] = useState(initialUri)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => setUri(initialUri), [initialUri])
  useEffect(() => {
    if (wc.proposal) {
      setBusy(false)
      setScanning(false)
      onClose()
    }
  }, [wc.proposal, onClose])
  useEffect(() => {
    if (!open) setScanning(false)
  }, [open])

  const blocked = wc.status !== 'ready' || activeWallet?.kind === 'watch'

  // Pairing only asks the app for its connection request; the user still approves it on the next screen.
  const connect = useCallback(
    async (value: string) => {
      setErr(null)
      setBusy(true)
      try {
        await wc.pair(value)
      } catch (e) {
        setErr((e as Error).message)
        setBusy(false)
      }
    },
    [wc],
  )
  const onScan = useCallback(
    (scanned: string) => {
      setScanning(false)
      setUri(scanned)
      void connect(scanned)
    },
    [connect],
  )

  return (
    <Modal open={open} onClose={onClose} title="Connect an app">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void connect(uri)
        }}
      >
        <p className="text-sm text-mute">
          On the app&apos;s website, choose <b className="text-white">WalletConnect</b>. Then scan its QR code, or copy the connection link (usually a &ldquo;Copy&rdquo; button under the QR
          code) and paste it here.
        </p>

        {scanning ? (
          <>
            <QrScanner onScan={onScan} />
            <button type="button" className="btn-ghost w-full" onClick={() => setScanning(false)}>
              Stop scanning
            </button>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" disabled={blocked || busy} onClick={() => setScanning(true)}>
              <Camera className="h-4 w-4" /> Scan QR code
            </button>
            <button type="button" className="btn-ghost" disabled={blocked || busy} onClick={() => fileInput.current?.click()}>
              <ImageUp className="h-4 w-4" /> Scan from image
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="QR code image"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                setErr(null)
                try {
                  const text = await decodeQrFile(file)
                  const found = text ? extractWcUri(text) : null
                  if (!text) setErr('No QR code found in that image. Try a sharper screenshot of just the QR code.')
                  else if (!found) setErr('That QR code is not a WalletConnect link.')
                  else onScan(found)
                } catch {
                  setErr('Could not read that image.')
                }
              }}
            />
          </div>
        )}

        <textarea className="input h-20 font-mono text-xs" placeholder="…or paste the wc: link" value={uri} onChange={(e) => setUri(e.target.value)} aria-label="WalletConnect link" spellCheck={false} />
        {activeWallet?.kind === 'watch' && <ErrorBox>Watch-only wallets cannot connect to apps. Switch to a wallet you can sign with.</ErrorBox>}
        {wc.status === 'error' && <ErrorBox>WalletConnect could not start: {wc.error}</ErrorBox>}
        {err && <ErrorBox>{err}</ErrorBox>}
        <Notice>Connecting only shares your public address. Every transaction or signature the app asks for will open a review screen first. QR images and camera frames never leave your device.</Notice>
        <button className="btn-primary w-full" disabled={!uri.trim() || busy || blocked}>
          {busy ? (
            <>
              <Spinner /> Waiting for the app…
            </>
          ) : wc.status === 'starting' ? (
            'Starting WalletConnect…'
          ) : (
            'Connect'
          )}
        </button>
      </form>
    </Modal>
  )
}

/** Connection approval dialog. */
export function WcProposalModal() {
  const wc = useWalletConnect()
  const { activeAccount, activeWallet } = useWallet()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const p = wc.proposal
  if (!p) return null
  const methods = [...new Set(Object.values({ ...p.params.requiredNamespaces, ...p.params.optionalNamespaces }).flatMap((n) => n.methods ?? []))]
  const chainNames = p.requestedChains.map((c) => Object.values(NETWORKS).find((n) => `eip155:${n.chainId}` === c)?.name ?? c)
  const blocked = p.verify.isScam || p.unsupportedRequired.length > 0 || activeWallet?.kind === 'watch' || !activeAccount

  return (
    <Modal open onClose={() => void wc.reject()} title="Connection request">
      <div className="space-y-4">
        <DappHeader dapp={p.dapp} verify={p.verify} />
        <VerifyNotice verify={p.verify} />
        <div className="rounded-xl bg-ink-900 px-4 py-1">
          <Row label="Account shared">
            <span className="mono text-xs">{activeAccount?.address}</span>
          </Row>
          <Row label="Networks requested">{chainNames.join(', ') || '—'}</Row>
        </div>
        <div>
          <p className="label">This app will be able to</p>
          <ul className="space-y-1 text-sm">
            <li>• See your public address and balances</li>
            {[...new Set(methods.map((m) => METHOD_LABELS[m]).filter(Boolean))].map((l) => (
              <li key={l}>• {l} — you approve each one</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mute">It can never move funds or sign anything without your approval in InWIF.</p>
        </div>
        {p.unsupportedRequired.length > 0 && (
          <ErrorBox>This app requires networks InWIF does not support ({p.unsupportedRequired.join(', ')}). InWIF works on Robinhood Chain.</ErrorBox>
        )}
        {activeWallet?.kind === 'watch' && <ErrorBox>Watch-only wallets cannot connect to apps.</ErrorBox>}
        {err && <ErrorBox>{err}</ErrorBox>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => void wc.reject()}>
            Reject
          </button>
          <button
            className="btn-primary flex-1"
            disabled={blocked || busy}
            onClick={async () => {
              setErr(null)
              setBusy(true)
              try {
                await wc.approve()
              } catch (e) {
                setErr((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} Connect
          </button>
        </div>
      </div>
    </Modal>
  )
}

const toBig = (v: unknown): bigint | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  try {
    return BigInt(v as string)
  } catch {
    return undefined
  }
}

/** Routes the current dApp request to the right InWIF review screen. */
export function WcRequestHandler() {
  const wc = useWalletConnect()
  const { activeAccount, state } = useWallet()
  const network = NETWORKS[state.network]
  const req = wc.request
  const answered = useRef<number | null>(null)

  // Simple read requests and immediate validation errors.
  useEffect(() => {
    if (!req || !activeAccount) return
    const chainHex = `0x${network.chainId.toString(16)}`
    if (req.method === 'eth_accounts' || req.method === 'eth_requestAccounts') void wc.respond([activeAccount.address])
    else if (req.method === 'eth_chainId') void wc.respond(chainHex)
    else if (!['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_signTypedData', 'wallet_switchEthereumChain'].includes(req.method))
      void wc.respondError(RPC_ERRORS.unsupported(`InWIF does not support ${req.method}.`))
    else if (req.method === 'eth_sendTransaction' && req.chainId !== `eip155:${network.chainId}`)
      void wc.respondError(RPC_ERRORS.wrongChain(`InWIF is on ${network.name} (chain ${network.chainId}). Switch networks in InWIF or in the app.`))
  }, [req, activeAccount, network, wc])

  const tx: { ok: TxRequest } | { error: { code: number; message: string } } | null = useMemo(() => {
    if (!req || req.method !== 'eth_sendTransaction' || req.chainId !== `eip155:${network.chainId}` || !activeAccount) return null
    const t = (req.params[0] ?? {}) as { from?: string; to?: string; value?: string; data?: string; input?: string }
    if (!t.from || !isAddress(t.from) || getAddress(t.from) !== activeAccount.address)
      return { error: RPC_ERRORS.unauthorized('The transaction is not from the connected InWIF account.') }
    if (!t.to || !isAddress(t.to)) return { error: RPC_ERRORS.unsupported('InWIF does not deploy contracts from dApp requests.') }
    const data = (t.data ?? t.input) as Hex | undefined
    if (data !== undefined && !isHex(data)) return { error: RPC_ERRORS.invalidParams('Invalid transaction data.') }
    return {
      ok: {
        to: getAddress(t.to),
        value: toBig(t.value),
        data: data && data !== '0x' ? data : undefined,
        summary: `${req.dapp.name} request`,
        kind: 'dapp',
        origin: { name: req.dapp.name, url: req.verify.origin || req.dapp.url, icon: req.dapp.icon, verified: req.verify.validation },
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id, network.chainId, activeAccount?.address])

  // Reply once with any validation error.
  const erroredFor = useRef<number | null>(null)
  useEffect(() => {
    if (req && tx && 'error' in tx && erroredFor.current !== req.id) {
      erroredFor.current = req.id
      void wc.respondError(tx.error)
    }
  }, [req, tx, wc])
  const txRequest = tx && 'ok' in tx ? tx.ok : null

  if (!req) return null
  if (txRequest)
    return (
      <TxFlow
        request={txRequest}
        onBroadcast={(hash) => {
          // Answer the dApp immediately, but keep the dialog open to show the confirmation.
          answered.current = req.id
          void wc.respond(hash, { advance: false })
        }}
        onClose={() => {
          if (answered.current !== req.id) void wc.respondError(RPC_ERRORS.userRejected)
          else wc.advance()
          answered.current = null
        }}
      />
    )
  if (['personal_sign', 'eth_signTypedData_v4', 'eth_signTypedData'].includes(req.method)) return <SignRequestModal key={req.id} req={req} />
  return null
}

function SignRequestModal({ req }: { req: PendingRequest }) {
  const wc = useWalletConnect()
  const { activeAccount, activeWallet, state, isUnlocked, unlock, softwareAccountFor } = useWallet()
  const hw = useHardware()
  const tokens = useTokens()
  const network = NETWORKS[state.network]
  const [password, setPassword] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const parsed = useMemo((): { kind: 'message'; payload: string; address?: string } | { kind: 'typed'; json: unknown; address?: string } | { error: string } => {
    try {
      if (req.method === 'personal_sign') {
        const [a, b] = req.params as string[]
        // Spec order is [message, address]; some apps send [address, message].
        if (isAddress(String(a)) && !isAddress(String(b))) return { kind: 'message', payload: String(b), address: String(a) }
        return { kind: 'message', payload: String(a), address: String(b) }
      }
      const [address, json] = req.params as [string, unknown]
      return { kind: 'typed', json, address }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [req])

  const review: SignReview | { error: string } = useMemo(() => {
    if ('error' in parsed) return parsed
    try {
      if (parsed.kind === 'message') return reviewPersonalSign(parsed.payload, { dappOrigin: req.verify.origin || req.dapp.url })
      const decimals: Record<string, number> = {}
      const symbols: Record<string, string> = {}
      for (const t of tokens) {
        decimals[t.address.toLowerCase()] = t.decimals
        symbols[t.address.toLowerCase()] = t.symbol
      }
      return reviewTypedData(parseTypedData(parsed.json), { expectedChainId: network.chainId, tokenDecimals: decimals, tokenSymbols: symbols })
    } catch (e) {
      return { error: `Could not read this request: ${(e as Error).message}` }
    }
  }, [parsed, req, tokens, network.chainId])

  if (!activeAccount || !activeWallet) return null
  const wrongAccount = !('error' in parsed) && !!parsed.address && (!isAddress(parsed.address) || getAddress(parsed.address) !== activeAccount.address)
  const isHardware = activeWallet.kind === 'hardware'
  const locked = !isHardware && activeWallet.kind !== 'watch' && !isUnlocked(activeWallet.id)
  const high = !('error' in review) && review.risk === 'high'
  const hwTyped = isHardware && req.method !== 'personal_sign'
  const canSign = !('error' in review) && !wrongAccount && !req.verify.isScam && !hwTyped && activeWallet.kind !== 'watch' && (!high || ack) && (!locked || password.length > 0)

  async function sign() {
    if ('error' in parsed || 'error' in review) return
    setBusy(true)
    setErr(null)
    try {
      let sig: Hex
      if (isHardware) {
        if (!hw.hw) throw new Error('Connect your InWIF device (or the simulator) on the Hardware page first.')
        if (parsed.kind !== 'message') throw new Error('Typed-data signing is not supported on InWIF hardware yet.')
        if ((await hw.hw.getAddress(activeAccount!.index)) !== activeAccount!.address) throw new Error('The connected device does not hold this account.')
        sig = await hw.hw.signMessage(parsed.payload, activeAccount!.index)
      } else {
        if (locked) await unlock(activeWallet!.id, password)
        const account = softwareAccountFor(activeWallet!.id, activeAccount!.index)
        if (parsed.kind === 'message') {
          sig = await account.signMessage({ message: isHex(parsed.payload) ? { raw: parsed.payload } : parsed.payload })
        } else {
          const td = parseTypedData(parsed.json)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { EIP712Domain: _domainType, ...types } = td.types
          sig = await account.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message } as unknown as Parameters<typeof account.signTypedData>[0])
        }
      }
      await wc.respond(sig)
    } catch (e) {
      setErr((e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={() => void wc.respondError(RPC_ERRORS.userRejected)} title={'error' in review ? 'Signature request' : review.title}>
      <div className="space-y-4">
        <DappHeader dapp={req.dapp} verify={req.verify} />
        <VerifyNotice verify={req.verify} />
        {'error' in review ? (
          <ErrorBox>{review.error}</ErrorBox>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone={review.risk === 'high' ? 'bad' : review.risk === 'medium' ? 'warn' : 'ok'}>Risk: {review.risk}</Badge>
              <Badge>No network fee — off-chain signature</Badge>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl bg-ink-900 px-4 py-1">
              <Row label="Account">
                <span className="mono text-xs">{activeAccount.address}</span>
              </Row>
              {review.lines.map((l, i) => (
                <Row key={`${l.label}-${i}`} label={l.label}>
                  <span className={cx('whitespace-pre-wrap', l.value === 'UNLIMITED' && 'font-bold text-bad', l.value.startsWith('0x') && 'mono text-xs')}>{l.value}</span>
                </Row>
              ))}
            </div>
            <Findings findings={review.findings} />
          </>
        )}
        {wrongAccount && <ErrorBox>The app asked for a signature from a different account than the one connected.</ErrorBox>}
        {hwTyped && <ErrorBox>Typed-data signatures (such as permits) are not supported on InWIF hardware yet. Reject this request.</ErrorBox>}
        {high && !('error' in review) && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF5C68]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>I understand this signature is high risk and I started this action myself on a site I trust.</span>
          </label>
        )}
        {locked && (
          <div>
            <label className="label" htmlFor="sig-pw">
              <Lock className="mr-1 inline h-3 w-3" /> Wallet password
            </label>
            <input id="sig-pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
        )}
        {err && <ErrorBox>{err}</ErrorBox>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" disabled={busy} onClick={() => void wc.respondError(RPC_ERRORS.userRejected)}>
            Reject
          </button>
          <button className="btn-primary flex-1" disabled={!canSign || busy} onClick={sign}>
            {busy ? <Spinner /> : high ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />} {isHardware ? 'Sign on device' : 'Sign'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export type { Address }
