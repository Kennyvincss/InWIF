import { getAddress, isAddress, recoverMessageAddress, type Address, type Hex } from 'viem'
import { VAULT_VERSION, type EncryptedVault } from './keystore'

/**
 * Sign in with @username + password on any device.
 *
 * The wallet's secret is already encrypted on the device with the user's password
 * (AES-256-GCM, PBKDF2-SHA256 600k). Turning sign-in on uploads that same encrypted vault;
 * the server never receives the password or the secret.
 *
 * To fetch the vault on another device the user proves the password with a separate
 * "sign-in key": PBKDF2(password, per-account random salt, domain-separated) — not the
 * encryption key. The server stores only SHA-256 of the sign-in key, compares it in constant
 * time, rate-limits and locks out after repeated failures, and only then returns the vault,
 * which is decrypted on the device. Turning sign-in on or off requires a signature from the
 * wallet's own key, so nobody can attach a vault to someone else's address.
 */

export const SIGNIN_KDF_ITERATIONS = 600_000
export const SIGNIN_MAX_VAULT_BYTES = 4_000
export const SIGNIN_MAX_AGE_MS = 10 * 60_000
/** Failed password attempts allowed per account per hour before sign-in locks for an hour. */
export const SIGNIN_MAX_FAILURES = 10

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const subtle = () => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('WebCrypto is not available.')
  return s
}

export function randomSalt(): string {
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  return hex(b)
}

/** The sign-in key (hex, 32 bytes). Domain-separated from the vault encryption key. */
export async function deriveSigninKey(password: string, saltHex: string, iterations = SIGNIN_KDF_ITERATIONS): Promise<string> {
  if (!/^[0-9a-f]{32}$/.test(saltHex)) throw new Error('Invalid salt.')
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = new TextEncoder().encode(`inwif-signin-v1:${saltHex}`)
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256)
  return hex(new Uint8Array(bits))
}

/** What the server stores and compares: SHA-256 of the sign-in key. */
export async function hashSigninKey(signinKeyHex: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(signinKeyHex)) throw new Error('Invalid sign-in key.')
  const bytes = new Uint8Array(signinKeyHex.match(/../g)!.map((h) => parseInt(h, 16)))
  return hex(new Uint8Array(await subtle().digest('SHA-256', bytes)))
}

export type SigninAction = 'enable' | 'disable'

/** Human-readable text the wallet signs to turn sign-in on or off. */
export function signinMessage(action: SigninAction, address: Address, issuedAt: string): string {
  return [
    'InWIF sign-in',
    '',
    action === 'enable'
      ? 'Turn on sign-in with my username and password for this address. Only my encrypted wallet is stored; my password and keys never leave my device.'
      : 'Turn off sign-in with my username and password for this address, and delete my encrypted wallet from InWIF.',
    getAddress(address),
    '',
    `Issued: ${issuedAt}`,
    '',
    'This signature is free. It does not send a transaction or give access to your funds.',
  ].join('\n')
}

export async function verifySigninSignature(action: SigninAction, address: string, issuedAt: string, signature: string, now = Date.now()): Promise<{ ok: true; address: Address } | { ok: false; error: string }> {
  if (!isAddress(address, { strict: false })) return { ok: false, error: 'Invalid address.' }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(issuedAt) || Number.isNaN(Date.parse(issuedAt))) return { ok: false, error: 'Invalid time.' }
  if (Math.abs(now - Date.parse(issuedAt)) > SIGNIN_MAX_AGE_MS) return { ok: false, error: 'The signature has expired. Please try again.' }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return { ok: false, error: 'Invalid signature.' }
  const a = getAddress(address)
  try {
    const signer = await recoverMessageAddress({ message: signinMessage(action, a, issuedAt), signature: signature as Hex })
    return signer === a ? { ok: true, address: a } : { ok: false, error: 'The signature is not from this address.' }
  } catch {
    return { ok: false, error: 'Invalid signature.' }
  }
}

/** Shape check for an uploaded vault (the server cannot decrypt it, only validate it). */
export function isValidVault(v: unknown): v is EncryptedVault {
  const x = v as EncryptedVault
  return (
    !!x &&
    x.version === VAULT_VERSION &&
    x.kdf?.name === 'PBKDF2' &&
    x.kdf.hash === 'SHA-256' &&
    Number.isInteger(x.kdf.iterations) &&
    x.kdf.iterations >= 100_000 &&
    typeof x.kdf.salt === 'string' &&
    x.cipher?.name === 'AES-GCM' &&
    typeof x.cipher.iv === 'string' &&
    typeof x.ciphertext === 'string' &&
    JSON.stringify(x).length <= SIGNIN_MAX_VAULT_BYTES
  )
}

/** Password rule when the encrypted vault will also be stored online: at least 12 characters. */
export function checkSigninPassword(password: string): { ok: boolean; problem?: string } {
  if (password.length < 12) return { ok: false, problem: 'To sign in with your username, your password needs at least 12 characters.' }
  return { ok: true }
}
