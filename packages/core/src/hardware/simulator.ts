/**
 * Browser/Node simulator of the InWIF hardware wallet.
 *
 * It implements the exact IWDP v1 protocol the real firmware implements, so the
 * companion app code path is identical. It is NOT secure hardware: keys live
 * in JavaScript memory. The UI always labels it as a simulator.
 *
 * Security behaviours modelled:
 *  - Seed is generated on the device and only ever shown on the device screen.
 *  - PIN is entered on the device, never sent over the transport.
 *  - Wrong PINs are rate-limited and the device wipes after 10 attempts.
 *  - Every signature requires a physical confirmation on the device.
 *  - The device decodes and displays transaction details itself.
 *  - Chain allow-list enforced on-device.
 */
import { bytesToHex, hexToBytes, keccak256, parseTransaction, toBytes, type Hex, type TransactionSerializable } from 'viem'
import { privateKeyToAccount, sign } from 'viem/accounts'
import { createMnemonic, derivePrivateKey } from '../mnemonic'
import { randomBytes } from '../keystore'
import { reviewTransaction } from '../risk'
import {
  Cmd,
  Status,
  concat,
  decodeFrame,
  decodePath,
  encodeResponse,
  type DeviceInfo,
  type Transport,
} from './protocol'
import {
  DEV_VENDOR_PRIVATE_KEY,
  attestDigest,
  certDigest,
  signDigest,
  verifyFirmwarePackage,
  type FirmwarePackage,
} from './vendor'

export interface DevicePrompt {
  kind: 'sign-tx' | 'sign-message' | 'show-address' | 'firmware-update'
  title: string
  lines: { label: string; value: string }[]
  warnings: string[]
}

export interface DeviceUI {
  /** Shown on device screen; resolves true when the user presses ✓, false for ✕. */
  confirm(prompt: DevicePrompt): Promise<boolean>
  /** Device-screen-only display of the recovery phrase during setup. */
  showRecoveryPhrase?(words: string[]): void
  onStateChange?(state: SimulatorState): void
}

export interface SimulatorState {
  initialized: boolean
  locked: boolean
  pinAttemptsLeft: number
  firmware: string
  busy: boolean
  wiped: boolean
}

const MAX_PIN_ATTEMPTS = 10

export class SimulatedDevice {
  readonly model = 'InWIF One (simulator)'
  readonly serial: string
  #mnemonic: string | null = null
  #pinHash: Hex | null = null
  #attestationKey: Hex
  #attestationCert: Hex | null = null
  #locked = true
  #attempts = MAX_PIN_ATTEMPTS
  #busy = false
  #firmware = '0.1.0-sim'
  #ui: DeviceUI
  allowedChainIds: number[]

  constructor(ui: DeviceUI, opts: { allowedChainIds?: number[]; serial?: string } = {}) {
    this.#ui = ui
    this.allowedChainIds = opts.allowedChainIds ?? [4663, 46630, 31337]
    this.serial = opts.serial ?? `IWSIM-${bytesToHex(randomBytes(4)).slice(2).toUpperCase()}`
    this.#attestationKey = bytesToHex(randomBytes(32))
  }

  get state(): SimulatorState {
    return {
      initialized: this.#mnemonic !== null,
      locked: this.#locked,
      pinAttemptsLeft: this.#attempts,
      firmware: this.#firmware,
      busy: this.#busy,
      wiped: this.#mnemonic === null && this.#attempts === 0,
    }
  }

  #emit() {
    this.#ui.onStateChange?.(this.state)
  }

  async #ensureCert() {
    if (!this.#attestationCert) {
      const addr = privateKeyToAccount(this.#attestationKey).address
      this.#attestationCert = await signDigest(certDigest(addr, this.serial), DEV_VENDOR_PRIVATE_KEY)
    }
    return this.#attestationCert
  }

  // ---- On-device actions (would be physical buttons / touchscreen) ----

  /** Generate a new seed on the device. The phrase goes only to the device screen. */
  setupNew(pin: string, strength: 128 | 256 = 256) {
    this.#assertPin(pin)
    this.#mnemonic = createMnemonic(strength)
    this.#pinHash = keccak256(toBytes(`${this.serial}:${pin}`))
    this.#locked = false
    this.#attempts = MAX_PIN_ATTEMPTS
    this.#ui.showRecoveryPhrase?.(this.#mnemonic.split(' '))
    this.#emit()
  }

  /** Restore from a phrase typed on the device itself. */
  restore(phrase: string, pin: string) {
    this.#assertPin(pin)
    this.#mnemonic = phrase.trim().toLowerCase().split(/\s+/).join(' ')
    this.#pinHash = keccak256(toBytes(`${this.serial}:${pin}`))
    this.#locked = false
    this.#attempts = MAX_PIN_ATTEMPTS
    this.#emit()
  }

  unlock(pin: string): boolean {
    if (!this.#pinHash) return false
    if (keccak256(toBytes(`${this.serial}:${pin}`)) === this.#pinHash) {
      this.#locked = false
      this.#attempts = MAX_PIN_ATTEMPTS
      this.#emit()
      return true
    }
    this.#attempts -= 1
    if (this.#attempts <= 0) this.wipe()
    this.#emit()
    return false
  }

  lock() {
    this.#locked = true
    this.#emit()
  }

  wipe() {
    this.#mnemonic = null
    this.#pinHash = null
    this.#locked = true
    this.#attempts = 0
    this.#emit()
  }

  #assertPin(pin: string) {
    if (!/^\d{6,8}$/.test(pin)) throw new Error('PIN must be 6–8 digits.')
  }

  // ---- Transport-facing request handler ----

  async handle(request: Uint8Array): Promise<Uint8Array> {
    let frame
    try {
      frame = decodeFrame(request)
    } catch {
      return encodeResponse(Status.BadRequest)
    }
    if (this.#busy) return encodeResponse(Status.Busy)
    this.#busy = true
    this.#emit()
    try {
      return await this.#dispatch(frame.code, frame.payload)
    } catch {
      return encodeResponse(Status.BadRequest)
    } finally {
      this.#busy = false
      this.#emit()
    }
  }

  async #dispatch(cmd: number, payload: Uint8Array): Promise<Uint8Array> {
    if (cmd === Cmd.GetInfo) {
      const info: DeviceInfo = {
        model: this.model,
        firmware: this.#firmware,
        serial: this.serial,
        initialized: this.#mnemonic !== null,
        locked: this.#locked,
        attestationKey: privateKeyToAccount(this.#attestationKey).address,
        attestationCert: await this.#ensureCert(),
        allowedChainIds: this.allowedChainIds,
        batteryPct: 100,
        simulated: true,
      }
      return encodeResponse(Status.Ok, new TextEncoder().encode(JSON.stringify(info)))
    }
    if (cmd === Cmd.Attest) {
      if (payload.length !== 32) return encodeResponse(Status.BadRequest)
      const sig = await signDigest(attestDigest(bytesToHex(payload), this.serial), this.#attestationKey)
      return encodeResponse(Status.Ok, hexToBytes(sig))
    }
    if (cmd === Cmd.FirmwareUpdate) {
      const pkg = JSON.parse(new TextDecoder().decode(payload)) as FirmwarePackage
      const v = await verifyFirmwarePackage(pkg)
      if (!v.ok) return encodeResponse(Status.BadSignature)
      const ok = await this.#ui.confirm({
        kind: 'firmware-update',
        title: 'Install firmware?',
        lines: [
          { label: 'Current', value: this.#firmware },
          { label: 'New', value: pkg.version },
          { label: 'Image hash', value: pkg.imageHash },
        ],
        warnings: v.production ? [] : ['Signed by the DEVELOPMENT key — not a production release.'],
      })
      if (!ok) return encodeResponse(Status.UserRejected)
      this.#firmware = pkg.version
      return encodeResponse(Status.Ok)
    }

    if (!this.#mnemonic) return encodeResponse(Status.NotInitialized)
    if (this.#locked) return encodeResponse(Status.Locked)

    if (cmd === Cmd.GetAddress) {
      const { path, rest } = decodePath(payload)
      const display = rest[0] === 1
      const index = this.#indexFromPath(path)
      const key = derivePrivateKey(this.#mnemonic, index)
      const address = privateKeyToAccount(key).address
      if (display) {
        const ok = await this.#ui.confirm({
          kind: 'show-address',
          title: 'Verify address',
          lines: [{ label: 'Address', value: address }, { label: 'Path', value: path }],
          warnings: ['Check this matches the address shown in the app.'],
        })
        if (!ok) return encodeResponse(Status.UserRejected)
      }
      return encodeResponse(Status.Ok, hexToBytes(address))
    }

    if (cmd === Cmd.SignTx) {
      const { path, rest } = decodePath(payload)
      const serialized = bytesToHex(rest)
      const tx = parseTransaction(serialized) as TransactionSerializable
      if (tx.chainId === undefined || !this.allowedChainIds.includes(tx.chainId)) return encodeResponse(Status.ChainNotAllowed)
      const key = derivePrivateKey(this.#mnemonic, this.#indexFromPath(path))
      const from = privateKeyToAccount(key).address
      const maxFee = (tx.gas ?? 0n) * (tx.maxFeePerGas ?? tx.gasPrice ?? 0n)
      const review = reviewTransaction(
        { to: tx.to ?? null, value: tx.value, data: tx.data, chainId: tx.chainId },
        { from, expectedChainId: tx.chainId, maxFeeWei: maxFee },
      )
      const ok = await this.#ui.confirm({
        kind: 'sign-tx',
        title: review.title,
        lines: [{ label: 'Network', value: `Chain ${tx.chainId}` }, ...review.lines, { label: 'Nonce', value: String(tx.nonce ?? 0) }],
        warnings: review.findings.filter((f) => f.severity !== 'info').map((f) => f.message),
      })
      if (!ok) return encodeResponse(Status.UserRejected)
      const sig = await sign({ hash: keccak256(serialized), privateKey: key })
      return encodeResponse(Status.Ok, concat(new Uint8Array([sig.yParity ?? 0]), hexToBytes(sig.r), hexToBytes(sig.s)))
    }

    if (cmd === Cmd.SignMessage) {
      const { path, rest } = decodePath(payload)
      const key = derivePrivateKey(this.#mnemonic, this.#indexFromPath(path))
      const account = privateKeyToAccount(key)
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(rest)
      } catch {
        text = bytesToHex(rest)
      }
      const ok = await this.#ui.confirm({
        kind: 'sign-message',
        title: 'Sign message',
        lines: [{ label: 'Account', value: account.address }, { label: 'Message', value: text.slice(0, 500) }],
        warnings: ['Only sign messages from applications you trust.'],
      })
      if (!ok) return encodeResponse(Status.UserRejected)
      const sig = await account.signMessage({ message: { raw: rest } })
      return encodeResponse(Status.Ok, hexToBytes(sig))
    }

    return encodeResponse(Status.Unsupported)
  }

  #indexFromPath(path: string): number {
    const m = /^m\/44'\/60'\/0'\/0\/(\d+)$/.exec(path)
    if (!m) throw new Error('Only m/44\'/60\'/0\'/0/i paths are supported')
    return Number(m[1])
  }
}

/** In-memory transport bound to a simulated device. */
export class SimulatorTransport implements Transport {
  readonly kind = 'simulator' as const
  constructor(private device: SimulatedDevice) {}
  exchange(request: Uint8Array): Promise<Uint8Array> {
    return this.device.handle(request)
  }
  async close() {}
}
