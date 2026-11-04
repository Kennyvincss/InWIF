/**
 * Device-authenticity and firmware-signing helpers.
 *
 * IMPORTANT: the key below is a publicly known DEVELOPMENT vendor root used
 * only by the simulator and test firmware. Production devices must use a
 * vendor root held in an HSM, and attestation keys generated inside each
 * device's secure element at manufacture. Anything signed by this dev key is
 * shown in the UI as "development device — not genuine hardware".
 */
import { concat, keccak256, recoverAddress, stringToBytes, toBytes, type Address, type Hex } from 'viem'
import { privateKeyToAccount, sign } from 'viem/accounts'

export const DEV_VENDOR_PRIVATE_KEY: Hex = keccak256(stringToBytes('InWIF development vendor root - NOT FOR PRODUCTION'))
export const DEV_VENDOR_ADDRESS: Address = privateKeyToAccount(DEV_VENDOR_PRIVATE_KEY).address

/** Vendor roots trusted by companion apps. Production root will be added once it exists. */
export const TRUSTED_VENDOR_ROOTS: { address: Address; label: string; production: boolean }[] = [
  { address: DEV_VENDOR_ADDRESS, label: 'InWIF development root (simulator / dev boards)', production: false },
]

export function certDigest(attestationKey: Address, serial: string): Hex {
  return keccak256(concat([stringToBytes('InWIF-attestation-cert-v1'), toBytes(attestationKey), stringToBytes(serial)]))
}

export function attestDigest(challenge: Hex, serial: string): Hex {
  return keccak256(concat([stringToBytes('InWIF-attest-v1'), toBytes(challenge), stringToBytes(serial)]))
}

export function firmwareDigest(version: string, imageHash: Hex): Hex {
  return keccak256(concat([stringToBytes('InWIF-fw-v1'), stringToBytes(version), toBytes(imageHash)]))
}

export function sigToHex(sig: { r: Hex; s: Hex; yParity?: number }): Hex {
  return concat([sig.r, sig.s, (sig.yParity ?? 0) === 1 ? '0x01' : '0x00'])
}

export async function signDigest(digest: Hex, privateKey: Hex): Promise<Hex> {
  return sigToHex(await sign({ hash: digest, privateKey }))
}

export async function recoverDigest(digest: Hex, signature: Hex): Promise<Address> {
  // 65 bytes: r(32) s(32) yParity(1)
  const r = `0x${signature.slice(2, 66)}` as Hex
  const s = `0x${signature.slice(66, 130)}` as Hex
  const yParity = Number.parseInt(signature.slice(130, 132), 16)
  return recoverAddress({ hash: digest, signature: { r, s, yParity } })
}

export interface FirmwarePackage {
  version: string
  imageHash: Hex
  /** Vendor signature over firmwareDigest(version, imageHash). */
  signature: Hex
  notes?: string
}

/** Build a dev-signed firmware package (used by tests and the simulator demo). */
export async function devSignFirmware(version: string, image: Uint8Array, notes?: string): Promise<FirmwarePackage> {
  const imageHash = keccak256(image)
  return { version, imageHash, signature: await signDigest(firmwareDigest(version, imageHash), DEV_VENDOR_PRIVATE_KEY), notes }
}

export async function verifyFirmwarePackage(pkg: FirmwarePackage, image?: Uint8Array) {
  if (image && keccak256(image) !== pkg.imageHash) return { ok: false as const, reason: 'Image hash does not match package.' }
  let signer: Address
  try {
    signer = await recoverDigest(firmwareDigest(pkg.version, pkg.imageHash), pkg.signature)
  } catch {
    return { ok: false as const, reason: 'Malformed signature.' }
  }
  const root = TRUSTED_VENDOR_ROOTS.find((r) => r.address === signer)
  if (!root) return { ok: false as const, reason: 'Package is not signed by a trusted InWIF vendor key.' }
  return { ok: true as const, production: root.production, signer }
}
