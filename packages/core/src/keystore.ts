/**
 * Local encrypted keystore.
 *
 * Uses only standard primitives provided by the platform's WebCrypto
 * implementation — PBKDF2-HMAC-SHA256 for key derivation and AES-256-GCM for
 * authenticated encryption. No custom cryptography.
 *
 * Secrets are encrypted per wallet, so unlocking one wallet never decrypts the
 * key material of another. Vaults never leave the device: there is no API in
 * InWIF that accepts them.
 */

export const KDF_ITERATIONS = 600_000 // OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
export const VAULT_VERSION = 1

export type WalletSecret =
  | { kind: 'mnemonic'; phrase: string }
  | { kind: 'privateKey'; privateKey: `0x${string}` }

export interface EncryptedVault {
  version: typeof VAULT_VERSION
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  ciphertext: string
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto
  if (!c?.subtle) throw new Error('WebCrypto is not available in this environment.')
  return c.subtle
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}

const b64 = {
  enc(bytes: Uint8Array): string {
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s)
  },
  dec(str: string): Uint8Array {
    const bin = atob(str)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface PasswordPolicyResult {
  ok: boolean
  problems: string[]
}

export function checkPassword(password: string): PasswordPolicyResult {
  const problems: string[] = []
  if (password.length < 10) problems.push('Use at least 10 characters.')
  if (!/[a-zA-Z]/.test(password)) problems.push('Include at least one letter.')
  if (!/[0-9\W_]/.test(password)) problems.push('Include at least one number or symbol.')
  return { ok: problems.length === 0, problems }
}

export async function encryptSecret(
  secret: WalletSecret,
  password: string,
  iterations = KDF_ITERATIONS,
): Promise<EncryptedVault> {
  if (!password) throw new Error('A password is required to encrypt the wallet.')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(password, salt, iterations)
  const plaintext = new TextEncoder().encode(JSON.stringify(secret))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext))
  plaintext.fill(0)
  return {
    version: VAULT_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64.enc(salt) },
    cipher: { name: 'AES-GCM', iv: b64.enc(iv) },
    ciphertext: b64.enc(ct),
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Incorrect password.')
    this.name = 'WrongPasswordError'
  }
}

export async function decryptSecret(vault: EncryptedVault, password: string): Promise<WalletSecret> {
  if (vault.version !== VAULT_VERSION) throw new Error(`Unsupported vault version ${vault.version}`)
  const key = await deriveKey(password, b64.dec(vault.kdf.salt), vault.kdf.iterations)
  let pt: ArrayBuffer
  try {
    pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: b64.dec(vault.cipher.iv) as BufferSource },
      key,
      b64.dec(vault.ciphertext) as BufferSource,
    )
  } catch {
    // AES-GCM authentication failure: wrong password or tampered vault.
    throw new WrongPasswordError()
  }
  const bytes = new Uint8Array(pt)
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as WalletSecret
  bytes.fill(0)
  return parsed
}

export function isEncryptedVault(v: unknown): v is EncryptedVault {
  const x = v as EncryptedVault
  return (
    !!x &&
    x.version === VAULT_VERSION &&
    x.kdf?.name === 'PBKDF2' &&
    typeof x.kdf.salt === 'string' &&
    x.cipher?.name === 'AES-GCM' &&
    typeof x.ciphertext === 'string'
  )
}
