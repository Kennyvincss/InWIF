/**
 * Redaction for logs, analytics and error reports. Anything secret-shaped is
 * replaced before it can leave the process.
 */
import { looksLikeSecret } from './validation'

const SECRET_KEYS = /^(mnemonic|seed|seedphrase|recoveryphrase|privatekey|private_key|secret|phrase|password|pin|vault|ciphertext)$/i

export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return '[depth]' as unknown as T
  if (typeof value === 'string') {
    if (looksLikeSecret(value)) return '[REDACTED]' as unknown as T
    // Also scrub any embedded 64-hex runs inside longer strings.
    return value.replace(/(0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/g, (m) =>
      m.length === 64 || m.length === 66 ? '[REDACTED]' : m,
    ) as unknown as T
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1)
    return out as T
  }
  return value
}
