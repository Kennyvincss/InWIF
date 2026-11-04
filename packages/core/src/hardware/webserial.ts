/**
 * WebSerial transport (Chrome/Edge desktop) for USB-C CDC devices running the
 * InWIF firmware (see firmware/). Frames use the IWDP v1 header, so responses
 * are read by first reading the 6-byte header then `len` payload bytes.
 */
import type { Transport } from './protocol'

/* Minimal typings so this file compiles without DOM WebSerial lib types. */
interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

export const INWIF_USB_FILTERS = [
  // Placeholder dev-board VID/PIDs (Raspberry Pi RP2040 CDC). Replaced once InWIF has its own USB IDs.
  { usbVendorId: 0x2e8a, usbProductId: 0x000a },
]

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export class WebSerialTransport implements Transport {
  readonly kind = 'webserial' as const
  #buf = new Uint8Array(0)
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  private constructor(private port: SerialPortLike) {}

  static async request(): Promise<WebSerialTransport> {
    if (!webSerialSupported()) throw new Error('WebSerial is not supported in this browser. Use Chrome or Edge on desktop.')
    const serial = (navigator as unknown as { serial: { requestPort(o: unknown): Promise<SerialPortLike> } }).serial
    const port = await serial.requestPort({ filters: INWIF_USB_FILTERS })
    await port.open({ baudRate: 115200 })
    return new WebSerialTransport(port)
  }

  async #read(n: number, timeoutMs: number): Promise<Uint8Array> {
    if (!this.port.readable) throw new Error('Port not readable')
    this.#reader ??= this.port.readable.getReader()
    const deadline = Date.now() + timeoutMs
    while (this.#buf.length < n) {
      if (Date.now() > deadline) throw new Error('Device timed out')
      const { value, done } = await this.#reader.read()
      if (done) throw new Error('Device disconnected')
      if (value) {
        const merged = new Uint8Array(this.#buf.length + value.length)
        merged.set(this.#buf)
        merged.set(value, this.#buf.length)
        this.#buf = merged
      }
    }
    const out = this.#buf.slice(0, n)
    this.#buf = this.#buf.slice(n)
    return out
  }

  async exchange(request: Uint8Array): Promise<Uint8Array> {
    if (!this.port.writable) throw new Error('Port not writable')
    const w = this.port.writable.getWriter()
    await w.write(request)
    w.releaseLock()
    // Generous timeout: the user may be reading the device screen.
    const header = await this.#read(6, 5 * 60_000)
    const len = (header[4]! << 8) | header[5]!
    const body = await this.#read(len, 10_000)
    const out = new Uint8Array(6 + len)
    out.set(header)
    out.set(body, 6)
    return out
  }

  async close() {
    try {
      this.#reader?.releaseLock()
    } catch {
      /* ignore */
    }
    await this.port.close()
  }
}
