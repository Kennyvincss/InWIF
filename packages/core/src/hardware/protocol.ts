/**
 * InWIF Device Protocol (IWDP) v1 — wire format shared by the companion apps,
 * the browser device simulator and the Rust firmware core (`firmware/`).
 *
 * Request frame:   'I' 'W' | ver(1) | cmd(1)    | len(u16 BE) | payload
 * Response frame:  'I' 'W' | ver(1) | status(1) | len(u16 BE) | payload
 *
 * Full specification: docs/hardware/protocol.md
 */

export const MAGIC = [0x49, 0x57] as const
export const PROTOCOL_VERSION = 1
export const MAX_PAYLOAD = 0xffff

export enum Cmd {
  GetInfo = 0x01,
  GetAddress = 0x03,
  SignTx = 0x04,
  SignMessage = 0x05,
  Attest = 0x06,
  FirmwareUpdate = 0x07,
}

export enum Status {
  Ok = 0x00,
  UserRejected = 0x01,
  Locked = 0x02,
  BadRequest = 0x03,
  Unsupported = 0x04,
  ChainNotAllowed = 0x05,
  Busy = 0x06,
  BadSignature = 0x07,
  NotInitialized = 0x08,
}

export const STATUS_MESSAGE: Record<Status, string> = {
  [Status.Ok]: 'OK',
  [Status.UserRejected]: 'Rejected on device',
  [Status.Locked]: 'Device is locked — enter your PIN on the device',
  [Status.BadRequest]: 'Malformed request',
  [Status.Unsupported]: 'Unsupported command',
  [Status.ChainNotAllowed]: 'Chain not allowed by device policy',
  [Status.Busy]: 'Device is busy with another request',
  [Status.BadSignature]: 'Signature verification failed',
  [Status.NotInitialized]: 'Device has not been set up',
}

export class DeviceError extends Error {
  constructor(public status: Status) {
    super(STATUS_MESSAGE[status] ?? `Device error 0x${status.toString(16)}`)
    this.name = 'DeviceError'
  }
}

function frame(code: number, payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_PAYLOAD) throw new Error('Payload too large')
  const out = new Uint8Array(6 + payload.length)
  out[0] = MAGIC[0]
  out[1] = MAGIC[1]
  out[2] = PROTOCOL_VERSION
  out[3] = code
  out[4] = (payload.length >> 8) & 0xff
  out[5] = payload.length & 0xff
  out.set(payload, 6)
  return out
}

export const encodeRequest = (cmd: Cmd, payload: Uint8Array = new Uint8Array()) => frame(cmd, payload)
export const encodeResponse = (status: Status, payload: Uint8Array = new Uint8Array()) => frame(status, payload)

export interface DecodedFrame {
  code: number
  payload: Uint8Array
}

export function decodeFrame(bytes: Uint8Array): DecodedFrame {
  if (bytes.length < 6) throw new Error('Frame too short')
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) throw new Error('Bad magic')
  if (bytes[2] !== PROTOCOL_VERSION) throw new Error(`Unsupported protocol version ${bytes[2]}`)
  const len = (bytes[4]! << 8) | bytes[5]!
  if (bytes.length !== 6 + len) throw new Error('Length mismatch')
  return { code: bytes[3]!, payload: bytes.slice(6) }
}

/** BIP-32 path encoding: count(u8) followed by u32 BE components (hardened bit set where needed). */
export function encodePath(path: string): Uint8Array {
  const parts = path.replace(/^m\//, '').split('/')
  if (parts.length > 10) throw new Error('Path too deep')
  const out = new Uint8Array(1 + parts.length * 4)
  out[0] = parts.length
  parts.forEach((p, i) => {
    const hardened = p.endsWith("'")
    const n = Number.parseInt(hardened ? p.slice(0, -1) : p, 10)
    if (!Number.isInteger(n) || n < 0 || n >= 0x80000000) throw new Error(`Bad path component ${p}`)
    const v = (hardened ? n + 0x80000000 : n) >>> 0
    out[1 + i * 4] = (v >>> 24) & 0xff
    out[2 + i * 4] = (v >>> 16) & 0xff
    out[3 + i * 4] = (v >>> 8) & 0xff
    out[4 + i * 4] = v & 0xff
  })
  return out
}

export function decodePath(bytes: Uint8Array): { path: string; rest: Uint8Array } {
  const n = bytes[0]
  if (n === undefined || n > 10 || bytes.length < 1 + n * 4) throw new Error('Bad path')
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const o = 1 + i * 4
    const v = ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0
    parts.push(v >= 0x80000000 ? `${v - 0x80000000}'` : String(v))
  }
  return { path: `m/${parts.join('/')}`, rest: bytes.slice(1 + n * 4) }
}

export function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0))
  let o = 0
  for (const a of arrs) {
    out.set(a, o)
    o += a.length
  }
  return out
}

/** Abstract byte transport (USB-C CDC serial, BLE, or in-memory simulator). */
export interface Transport {
  readonly kind: 'simulator' | 'webserial' | 'webhid' | 'ble'
  exchange(request: Uint8Array): Promise<Uint8Array>
  close(): Promise<void>
}

export interface DeviceInfo {
  model: string
  firmware: string
  serial: string
  initialized: boolean
  locked: boolean
  /** Address form of the device attestation public key. */
  attestationKey: `0x${string}`
  /** Vendor signature over the attestation key (certificate). */
  attestationCert: `0x${string}`
  allowedChainIds: number[]
  batteryPct?: number
  simulated: boolean
}
