'use client'
import { useState } from 'react'
import Link from 'next/link'
import { stringToBytes } from 'viem'
import { BadgeCheck, Cpu, Plug, PlugZap, RefreshCw, ShieldAlert, Usb } from 'lucide-react'
import { devSignFirmware, webSerialSupported } from '@inwif/core'
import { useHardware } from '@/lib/hardware'
import { useWallet, type AccountRec } from '@/lib/wallet-store'
import { useNotify } from '@/lib/notifications'
import { SimulatorScreen } from '@/components/DevicePanel'
import { Badge, ErrorBox, Notice, PageHeader, Row, Spinner } from '@/components/ui'
import { timeAgo } from '@/lib/format'
import { TauriSerialTransport, isTauri, listSerialPorts } from '@/lib/tauri-transport'
import { HARDWARE_ENABLED } from '@/lib/features'

const FLOW = [
  'Companion app constructs the transaction',
  'Transaction is transferred to the device',
  'Device decodes and displays the details',
  'You verify the details on the device screen',
  'You physically confirm on the device',
  'Device signs internally',
  'Signature returns to the companion app',
  'Companion app broadcasts it',
]

export default function HardwarePage() {
  return HARDWARE_ENABLED ? <HardwareConsole /> : <HardwareComingSoon />
}

function HardwareComingSoon() {
  return (
    <div className="space-y-6">
      <PageHeader title="Hardware wallet" subtitle="Keys kept on a dedicated device, every signature confirmed with a physical button." />
      <section className="card relative overflow-hidden p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Cpu className="h-5 w-5 text-accent" /> InWIF One
          </h2>
          <Badge tone="ok">Coming soon</Badge>
        </div>
        <p className="mt-2 text-sm text-mute">
          The InWIF One hardware wallet is in development and not available yet. Until then, your InWIF wallet keeps your keys encrypted on this device, and you approve
          every transaction yourself.
        </p>
        <Link href="/hardware" className="btn-ghost mt-4">
          About InWIF One
        </Link>
      </section>
    </div>
  )
}

function HardwareConsole() {
  const h = useHardware()
  const wallet = useWallet()
  const notify = useNotify()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [nameEdit, setNameEdit] = useState('')

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setErr(null)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const deviceName = h.info ? (wallet.state.deviceNames[h.info.serial] ?? h.info.model) : ''
  const existing = h.info && wallet.state.wallets.find((w) => w.device?.serial === h.info!.serial)
  const reached = new Set(h.steps.map((s) => s.step))
  if (h.pending?.prompt.kind === 'sign-tx') [3, 4].forEach((s) => reached.add(s))

  return (
    <div className="space-y-6">
      <PageHeader title="Hardware wallet" subtitle="Keys generated and kept on the device. Every signature confirmed with a physical button." />

      <Notice tone="warn">
        The InWIF One hardware wallet is a <b>prototype in development</b> — no production device has been manufactured or independently tested yet. Use the simulator to try the
        complete offline-signing flow, or a development board flashed with the InWIF firmware (see <code>firmware/</code>).
      </Notice>

      {!h.hw ? (
        <div className="grid gap-4 md:grid-cols-2">
          <button className="card p-6 text-left transition hover:border-accent/30" onClick={() => h.startSimulator()}>
            <Cpu className="h-8 w-8 text-accent" />
            <p className="mt-3 font-display text-lg font-bold">Start device simulator</p>
            <p className="mt-1 text-sm text-mute">Runs the same IWDP protocol as the firmware, in this tab. Not secure hardware — for demonstration and development.</p>
          </button>
          {isTauri() ? (
          <button
            className="card p-6 text-left transition hover:border-accent/30"
            onClick={() =>
              run('usb', async () => {
                const ports = await listSerialPorts()
                const port = ports.find((p) => p.likely_inwif) ?? ports[0]
                if (!port) throw new Error('No USB serial device found. Connect your InWIF device or dev board.')
                await h.connectTransport(await TauriSerialTransport.open(port.name))
                notify.push({ type: 'hardware', title: `Hardware device connected on ${port.name}` })
              })
            }
          >
            <Usb className="h-8 w-8 text-accent" />
            <p className="mt-3 font-display text-lg font-bold">Connect over USB-C (native)</p>
            <p className="mt-1 text-sm text-mute">Desktop app: direct USB serial access to your InWIF device or development board.</p>
          </button>
          ) : (
          <button
            className="card p-6 text-left transition hover:border-accent/30 disabled:opacity-50"
            disabled={!webSerialSupported()}
            onClick={() =>
              run('usb', async () => {
                await h.connectWebSerial()
                notify.push({ type: 'hardware', title: 'Hardware device connected over USB' })
              })
            }
          >
            <Usb className="h-8 w-8 text-accent" />
            <p className="mt-3 font-display text-lg font-bold">Connect over USB-C</p>
            <p className="mt-1 text-sm text-mute">
              {webSerialSupported() ? 'WebSerial: pick your InWIF device or development board.' : 'Requires a Chromium-based desktop browser (WebSerial), or the InWIF desktop app.'}
            </p>
          </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px,1fr]">
          <div>
            {h.simulator ? <SimulatorScreen /> : <Notice>Physical device connected — look at its screen.</Notice>}
            {h.simulator && <p className="mt-3 text-center text-xs text-mute">Simulator state lives in memory: reloading the page powers it off.</p>}
          </div>

          <div className="space-y-6">
            <section className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display font-bold">Device</h2>
                <Badge tone="ok">
                  <PlugZap className="h-3 w-3" /> Connected · {h.hw.transport.kind}
                </Badge>
              </div>
              <Row label="Name">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!h.info || !nameEdit.trim()) return
                    wallet.update((s) => ({ ...s, deviceNames: { ...s.deviceNames, [h.info!.serial]: nameEdit.trim().slice(0, 32) } }))
                    setNameEdit('')
                  }}
                >
                  <input className="input w-40 py-1 text-xs" placeholder={deviceName} value={nameEdit} onChange={(e) => setNameEdit(e.target.value)} aria-label="Rename device" />
                  <button className="btn-ghost px-2 py-1 text-xs">Rename</button>
                </form>
              </Row>
              <Row label="Model">{h.info?.model ?? '…'}</Row>
              <Row label="Serial">{h.info?.serial ?? '…'}</Row>
              <Row label="Firmware">{h.simState?.firmware ?? h.info?.firmware ?? '…'}</Row>
              <Row label="Battery">{h.info?.batteryPct !== undefined ? `${h.info.batteryPct}%` : 'n/a'}</Row>
              <Row label="State">{h.simState ? (!h.simState.initialized ? 'Not set up' : h.simState.locked ? 'Locked' : 'Unlocked') : h.info?.locked ? 'Locked' : 'Unlocked'}</Row>
              <Row label="Allowed chains">{h.info?.allowedChainIds.join(', ')}</Row>
              <Row label="Authenticity">
                {!h.authenticity ? (
                  'Not checked'
                ) : h.authenticity.production ? (
                  <span className="text-ok">Genuine InWIF device</span>
                ) : (
                  <span className="text-warn">{h.authenticity.reason ?? 'Not genuine'}</span>
                )}
              </Row>
              <Row label="Last sync">{h.lastSync ? timeAgo(new Date(h.lastSync).toISOString()) : '—'}</Row>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-ghost text-xs" onClick={() => run('verify', async () => void (await h.verify()))}>
                  {busy === 'verify' ? <Spinner /> : <BadgeCheck className="h-4 w-4" />} Verify authenticity
                </button>
                <button className="btn-ghost text-xs" onClick={() => run('sync', async () => void (await h.refreshInfo()))}>
                  <RefreshCw className="h-4 w-4" /> Sync
                </button>
                {h.simulator && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      run('fw', async () => {
                        const pkg = await devSignFirmware('0.2.0-sim', stringToBytes('InWIF simulator firmware 0.2.0'), 'Development build')
                        await h.hw!.updateFirmware(pkg)
                        await h.refreshInfo()
                        notify.push({ type: 'firmware', title: 'Firmware updated to 0.2.0-sim', body: 'Authenticated package (development key).' })
                        setMsg('Firmware package signature verified on-device and installed.')
                      })
                    }
                  >
                    {busy === 'fw' ? <Spinner /> : null} Install update (0.2.0-sim)
                  </button>
                )}
                <button className="btn-ghost text-xs text-bad" onClick={() => h.disconnect()}>
                  <Plug className="h-4 w-4" /> Disconnect
                </button>
              </div>
              {!h.simulator && <p className="mt-2 text-xs text-mute">No production firmware has been published yet, so no update is available.</p>}
            </section>

            <section className="card p-5">
              <h2 className="mb-2 font-display font-bold">Accounts</h2>
              {existing ? (
                <p className="text-sm text-mute">
                  This device is linked to wallet <b className="text-fg">{existing.name}</b>. Select it in the top bar to sign with the device.
                </p>
              ) : (
                <p className="text-sm text-mute">Read the first three public addresses from the device and add them as a hardware wallet. Keys stay on the device.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!existing && (
                  <button
                    className="btn-primary"
                    onClick={() =>
                      run('add', async () => {
                        const accounts: AccountRec[] = []
                        for (let i = 0; i < 3; i++) accounts.push({ index: i, address: await h.hw!.getAddress(i), label: `Device account ${i + 1}` })
                        wallet.addHardwareWallet({ name: deviceName || 'InWIF device', serial: h.info!.serial, model: h.info!.model, simulated: !!h.info!.simulated, accounts })
                        notify.push({ type: 'hardware', title: `Added ${deviceName || 'device'} as a wallet` })
                        setMsg('Hardware wallet added. It is now the active wallet.')
                      })
                    }
                  >
                    {busy === 'add' ? <Spinner /> : null} Add device accounts
                  </button>
                )}
                <button
                  className="btn-ghost"
                  onClick={() =>
                    run('show', async () => {
                      const a = await h.hw!.getAddress(wallet.activeAccount?.index ?? 0, true)
                      setMsg(`Device confirmed address ${a}`)
                    })
                  }
                >
                  Verify address on device
                </button>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    run('msg', async () => {
                      const sig = await h.hw!.signMessage(`InWIF device test ${new Date().toISOString()}`, 0)
                      setMsg(`Message signed on device: ${sig.slice(0, 26)}…`)
                    })
                  }
                >
                  Sign test message
                </button>
              </div>
              {busy && !['verify', 'sync'].includes(busy) && h.pending && <p className="mt-2 text-sm text-accent">Confirm on the device…</p>}
            </section>

            <section className="card p-5">
              <h2 className="mb-1 font-display font-bold">Offline signing flow</h2>
              <p className="mb-3 text-xs text-mute">
                Steps light up as they happen when you send from the hardware wallet (<Link className="text-accent" href="/app/send">Send</Link>). The private key never leaves the
                device; the companion only receives the signature and checks it recovers to your address before broadcasting.
              </p>
              <ol className="space-y-1.5">
                {FLOW.map((f, i) => (
                  <li key={f} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${reached.has(i + 1) ? 'bg-accent/10 text-accent' : 'text-mute'}`}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">{i + 1}</span>
                    {f}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}

      {err && <ErrorBox>{err}</ErrorBox>}
      {msg && <Notice tone="lime">{msg}</Notice>}

      <section className="card p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display font-bold">
          <ShieldAlert className="h-5 w-5 text-accent" /> Security model
        </h2>
        <ul className="grid gap-2 text-sm text-mute md:grid-cols-2">
          <li>• Seed generated on-device and shown only on the device screen</li>
          <li>• PIN entered on the device, never sent over USB; wipe after 10 failures</li>
          <li>• Device decodes transactions itself — the app cannot hide details</li>
          <li>• On-device chain allow-list (Robinhood Chain mainnet)</li>
          <li>• Challenge-response attestation against the InWIF vendor root</li>
          <li>• Firmware accepted only with a valid vendor signature</li>
        </ul>
        <p className="mt-3 text-xs text-mute">
          Production hardware will hold keys in a certified secure element with secure boot. Until that hardware exists and has been independently tested, InWIF makes no claim of
          hardware-grade protection.
        </p>
      </section>
    </div>
  )
}
