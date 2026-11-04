'use client'
/**
 * Native USB-serial transport for the desktop app. Frames are passed to the
 * Tauri backend (apps/desktop/src-tauri), which validates them as IWDP v1
 * before writing to the device. Keys never pass through here — only frames.
 */
import type { Transport } from '@inwif/core'

interface TauriGlobal {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> }
}

export interface SerialPortInfo {
  name: string
  vid?: number
  pid?: number
  product?: string
  likely_inwif: boolean
}

function tauri(): TauriGlobal | undefined {
  return (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
}

export const isTauri = () => !!tauri()

export function listSerialPorts(): Promise<SerialPortInfo[]> {
  return tauri()!.core.invoke<SerialPortInfo[]>('list_serial_ports')
}

export class TauriSerialTransport implements Transport {
  readonly kind = 'webserial' as const
  private constructor(private port: string) {}

  static async open(port: string) {
    await tauri()!.core.invoke('device_open', { port })
    return new TauriSerialTransport(port)
  }

  async exchange(request: Uint8Array): Promise<Uint8Array> {
    const res = await tauri()!.core.invoke<number[]>('device_exchange', { port: this.port, frame: Array.from(request) })
    return Uint8Array.from(res)
  }

  async close() {
    await tauri()!.core.invoke('device_close', { port: this.port })
  }
}
