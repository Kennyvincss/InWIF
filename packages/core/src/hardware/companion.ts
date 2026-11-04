/**
 * Companion-side driver for InWIF hardware wallets (real or simulated).
 *
 * Offline signing flow:
 *  1. Companion builds an unsigned EIP-1559 transaction.
 *  2. The serialized transaction is sent to the device (SIGN_TX).
 *  3. The device decodes and displays it; the user confirms physically.
 *  4. The device returns only (yParity, r, s).
 *  5. The companion assembles the signed transaction, verifies the signature
 *     recovers to the expected account, and only then broadcasts it.
 */
import {
  bytesToHex,
  getAddress,
  hexToBytes,
  keccak256,
  recoverAddress,
  serializeTransaction,
  toBytes,
  type Address,
  type Hex,
  type TransactionSerializableEIP1559,
} from 'viem'
import { derivationPath } from '../mnemonic'
import { randomBytes } from '../keystore'
import { Cmd, DeviceError, Status, concat, decodeFrame, encodePath, encodeRequest, type DeviceInfo, type Transport } from './protocol'
import { TRUSTED_VENDOR_ROOTS, attestDigest, certDigest, recoverDigest, type FirmwarePackage } from './vendor'

export interface AuthenticityResult {
  genuine: boolean
  production: boolean
  vendorLabel?: string
  reason?: string
}

export class HardwareWallet {
  constructor(public transport: Transport) {}

  async #call(cmd: Cmd, payload?: Uint8Array): Promise<Uint8Array> {
    const res = decodeFrame(await this.transport.exchange(encodeRequest(cmd, payload)))
    if (res.code !== Status.Ok) throw new DeviceError(res.code as Status)
    return res.payload
  }

  async getInfo(): Promise<DeviceInfo> {
    const p = await this.#call(Cmd.GetInfo)
    return JSON.parse(new TextDecoder().decode(p)) as DeviceInfo
  }

  async getAddress(index = 0, displayOnDevice = false): Promise<Address> {
    const p = await this.#call(Cmd.GetAddress, concat(encodePath(derivationPath(index)), new Uint8Array([displayOnDevice ? 1 : 0])))
    if (p.length !== 20) throw new Error('Device returned a malformed address')
    return getAddress(bytesToHex(p))
  }

  /**
   * Challenge-response authenticity check:
   *  - attestation certificate must be signed by a trusted vendor root;
   *  - device must sign a fresh random challenge with that attestation key.
   */
  async verifyAuthenticity(): Promise<AuthenticityResult> {
    const info = await this.getInfo()
    let vendor: Address
    try {
      vendor = await recoverDigest(certDigest(info.attestationKey, info.serial), info.attestationCert)
    } catch {
      return { genuine: false, production: false, reason: 'Malformed attestation certificate.' }
    }
    const root = TRUSTED_VENDOR_ROOTS.find((r) => r.address === vendor)
    if (!root) return { genuine: false, production: false, reason: 'Certificate is not signed by a trusted InWIF vendor key.' }
    const challenge = bytesToHex(randomBytes(32))
    const sig = bytesToHex(await this.#call(Cmd.Attest, hexToBytes(challenge)))
    const signer = await recoverDigest(attestDigest(challenge, info.serial), sig)
    if (signer !== getAddress(info.attestationKey))
      return { genuine: false, production: false, reason: 'Device failed the challenge-response test.' }
    return {
      genuine: root.production,
      production: root.production,
      vendorLabel: root.label,
      reason: root.production ? undefined : 'Development device: authenticated by the dev root, not genuine production hardware.',
    }
  }

  async signTransaction(tx: TransactionSerializableEIP1559, index: number, expectedFrom: Address): Promise<Hex> {
    const unsigned = serializeTransaction({ ...tx, type: 'eip1559' })
    const p = await this.#call(Cmd.SignTx, concat(encodePath(derivationPath(index)), hexToBytes(unsigned)))
    if (p.length !== 65) throw new Error('Device returned a malformed signature')
    const yParity = p[0]!
    const r = bytesToHex(p.slice(1, 33))
    const s = bytesToHex(p.slice(33, 65))
    const signer = await recoverAddress({ hash: keccak256(unsigned), signature: { r, s, yParity } })
    if (signer !== getAddress(expectedFrom)) {
      throw new Error('Signature does not match the expected account — refusing to broadcast.')
    }
    return serializeTransaction({ ...tx, type: 'eip1559' }, { r, s, yParity })
  }

  async signMessage(message: string, index: number): Promise<Hex> {
    const p = await this.#call(Cmd.SignMessage, concat(encodePath(derivationPath(index)), toBytes(message)))
    return bytesToHex(p)
  }

  async updateFirmware(pkg: FirmwarePackage): Promise<void> {
    await this.#call(Cmd.FirmwareUpdate, new TextEncoder().encode(JSON.stringify(pkg)))
  }

  close() {
    return this.transport.close()
  }
}
