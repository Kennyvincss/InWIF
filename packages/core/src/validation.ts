import { getAddress, isAddress, parseUnits, type Address } from 'viem'
import { wordlist } from '@scure/bip39/wordlists/english'

export type Severity = 'info' | 'warning' | 'danger'

export interface Finding {
  code: string
  severity: Severity
  message: string
}

export interface AddressCheck {
  ok: boolean
  address?: Address
  findings: Finding[]
}

/**
 * Validate a recipient address typed or pasted by the user.
 * Only `ok: true` results may be used to build a transaction.
 */
export function checkRecipient(
  input: string,
  ctx: { self?: Address; knownTokens?: Address[]; blocklist?: Set<string> } = {},
): AddressCheck {
  const raw = input.trim()
  const findings: Finding[] = []

  if (!raw) return { ok: false, findings: [{ code: 'empty', severity: 'danger', message: 'Enter a recipient address.' }] }

  if (looksLikeSecret(raw)) {
    return {
      ok: false,
      findings: [
        {
          code: 'secret-pasted',
          severity: 'danger',
          message:
            'This looks like a private key or recovery phrase, not an address. Never paste secrets into a recipient field.',
        },
      ],
    }
  }

  if (/\.(eth|hood|wif)$/i.test(raw)) {
    return {
      ok: false,
      findings: [{ code: 'name-unsupported', severity: 'danger', message: 'ENS-style names do not work on Robinhood Chain. Use an InWIF @username or a 0x address.' }],
    }
  }

  if (!isAddress(raw, { strict: false })) {
    return { ok: false, findings: [{ code: 'invalid', severity: 'danger', message: 'Not a valid EVM address.' }] }
  }

  // Mixed-case input must carry a valid EIP-55 checksum.
  const hasMixedCase = raw.slice(2) !== raw.slice(2).toLowerCase() && raw.slice(2) !== raw.slice(2).toUpperCase()
  if (hasMixedCase && !isAddress(raw, { strict: true })) {
    return {
      ok: false,
      findings: [{ code: 'bad-checksum', severity: 'danger', message: 'Checksum mismatch — the address may have been mistyped.' }],
    }
  }

  const address = getAddress(raw)

  if (address === '0x0000000000000000000000000000000000000000') {
    return { ok: false, findings: [{ code: 'zero', severity: 'danger', message: 'Sending to the zero address burns funds permanently.' }] }
  }

  if (ctx.blocklist?.has(address.toLowerCase())) {
    findings.push({ code: 'blocklisted', severity: 'danger', message: 'This address is on your local list of flagged addresses.' })
  }
  if (ctx.self && address === getAddress(ctx.self)) {
    findings.push({ code: 'self', severity: 'warning', message: 'You are sending to your own address.' })
  }
  if (ctx.knownTokens?.some((t) => getAddress(t) === address)) {
    findings.push({
      code: 'token-contract',
      severity: 'danger',
      message: 'This is a token contract address. Tokens sent to a token contract are usually lost.',
    })
  }
  if (!hasMixedCase) {
    findings.push({
      code: 'no-checksum',
      severity: 'info',
      message: 'Address has no checksum. Double-check every character with the recipient.',
    })
  }

  return { ok: !findings.some((f) => f.code === 'blocklisted'), address, findings }
}

/** Heuristic detection of private keys and BIP-39 phrases — used to block accidental leaks. */
export function looksLikeSecret(input: string): boolean {
  const s = input.trim()
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return true
  const words = s.toLowerCase().split(/\s+/)
  if (words.length >= 12) {
    const hits = words.filter((w) => wordlist.includes(w)).length
    if (hits / words.length >= 0.8) return true
  }
  return false
}

/**
 * Recursively check an arbitrary payload for secret-shaped strings (used by API + logger).
 *
 * `allowHex32`: JSON-RPC params are full of legitimate 32-byte hex values (transaction
 * hashes, log topics, storage slots) that are indistinguishable from a raw private key,
 * so the RPC relay sets this and keeps only the recovery-phrase and key-named-field checks.
 */
export function containsSecret(value: unknown, depthOrOpts: number | { allowHex32?: boolean } = 0, opts: { allowHex32?: boolean } = {}): boolean {
  const depth = typeof depthOrOpts === 'number' ? depthOrOpts : 0
  const o = typeof depthOrOpts === 'number' ? opts : depthOrOpts
  if (depth > 8) return false
  if (typeof value === 'string') {
    if (o.allowHex32 && /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim())) return false
    return looksLikeSecret(value)
  }
  if (Array.isArray(value)) return value.some((v) => containsSecret(v, depth + 1, o))
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/^(mnemonic|seed|seedphrase|recoveryphrase|privatekey|private_key|secret|phrase)$/i.test(k)) return true
      if (containsSecret(v, depth + 1, o)) return true
    }
  }
  return false
}

export interface AmountCheck {
  ok: boolean
  raw?: bigint
  error?: string
}

/** Parse a decimal amount string into base units with strict validation. */
export function parseAmount(input: string, decimals: number, available?: bigint): AmountCheck {
  const s = input.trim().replace(/,/g, '')
  if (!s) return { ok: false, error: 'Enter an amount.' }
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return { ok: false, error: 'Enter a valid number.' }
  const [, frac = ''] = s.split('.')
  if (frac.length > decimals) return { ok: false, error: `Maximum ${decimals} decimal places.` }
  let raw: bigint
  try {
    raw = parseUnits(s, decimals)
  } catch {
    return { ok: false, error: 'Enter a valid number.' }
  }
  if (raw <= 0n) return { ok: false, error: 'Amount must be greater than zero.' }
  if (available !== undefined && raw > available) return { ok: false, raw, error: 'Insufficient balance.' }
  return { ok: true, raw }
}

export function shortAddress(a: string, chars = 4): string {
  return a.length > 2 + chars * 2 ? `${a.slice(0, 2 + chars)}…${a.slice(-chars)}` : a
}
