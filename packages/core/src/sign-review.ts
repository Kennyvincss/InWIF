/**
 * Review of off-chain signature requests from dApps (personal_sign and
 * eth_signTypedData_v4). These cost no gas but can be just as dangerous as a
 * transaction: a token "permit" signature lets the spender move your tokens.
 */
import { formatUnits, getAddress, hexToBytes, isAddress, isHex, type Address } from 'viem'
import { UNLIMITED_THRESHOLD } from './risk'
import type { Finding } from './validation'

export interface SignReview {
  title: string
  lines: { label: string; value: string }[]
  findings: Finding[]
  risk: 'low' | 'medium' | 'high'
}

const riskOf = (f: Finding[]): SignReview['risk'] =>
  f.some((x) => x.severity === 'danger') ? 'high' : f.some((x) => x.severity === 'warning') ? 'medium' : 'low'

const NOT_A_GUARANTEE: Finding = {
  code: 'not-a-guarantee',
  severity: 'info',
  message: 'Absence of warnings does not mean a signature request is safe. Only sign for sites you trust.',
}

/** Decode a personal_sign payload (hex or plain text) for display. */
export function decodePersonalMessage(payload: string): { text: string; isUtf8: boolean; bytes: number } {
  if (!isHex(payload)) return { text: payload, isUtf8: true, bytes: new TextEncoder().encode(payload).length }
  const bytes = (payload.length - 2) / 2
  try {
    // Strict UTF-8: invalid byte sequences throw instead of becoming replacement characters.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(hexToBytes(payload))
    // Reject strings with control characters (other than whitespace): probably binary data.
    const printable = !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)
    return printable ? { text, isUtf8: true, bytes } : { text: payload, isUtf8: false, bytes }
  } catch {
    return { text: payload, isUtf8: false, bytes }
  }
}

export function reviewPersonalSign(payload: string, ctx: { dappOrigin?: string } = {}): SignReview {
  const m = decodePersonalMessage(payload)
  const findings: Finding[] = []
  if (!m.isUtf8) {
    findings.push({
      code: 'blind-sign',
      severity: m.bytes === 32 ? 'danger' : 'warning',
      message:
        m.bytes === 32
          ? 'This is an unreadable 32-byte value, often a hash. Signing a hash can authorise actions you cannot see. Only continue if you know exactly what it is.'
          : 'This message is not readable text. Only sign it if you know exactly what it is.',
    })
  }
  if (ctx.dappOrigin && m.isUtf8) {
    // Sign-In-With-Ethereum style messages state the domain they are for; flag a mismatch.
    const domain = /^([a-z0-9.-]+\.[a-z]{2,}(?::\d+)?) wants you to sign in/im.exec(m.text)?.[1]
    if (domain) {
      try {
        const host = new URL(ctx.dappOrigin).host
        if (domain.toLowerCase() !== host.toLowerCase())
          findings.push({ code: 'siwe-domain-mismatch', severity: 'danger', message: `This sign-in message is for ${domain}, but the request comes from ${host}.` })
      } catch {
        /* ignore malformed origin */
      }
    }
  }
  findings.push(NOT_A_GUARANTEE)
  return { title: 'Sign message', lines: [{ label: 'Message', value: m.text }], findings, risk: riskOf(findings) }
}

export interface TypedDataPayload {
  domain?: { name?: string; version?: string; chainId?: number | string; verifyingContract?: string }
  types: Record<string, { name: string; type: string }[]>
  primaryType: string
  message: Record<string, unknown>
}

/** Parse the second param of eth_signTypedData_v4 (JSON string or object). */
export function parseTypedData(input: unknown): TypedDataPayload {
  const v = (typeof input === 'string' ? JSON.parse(input) : input) as TypedDataPayload
  if (!v || typeof v !== 'object' || !v.types || !v.primaryType || !v.message) throw new Error('Malformed typed data')
  return v
}

const PERMIT2_TYPES = new Set(['PermitSingle', 'PermitBatch', 'PermitTransferFrom', 'PermitBatchTransferFrom', 'PermitWitnessTransferFrom'])

function amountText(raw: unknown, token?: string, ctx?: ReviewTypedDataContext): string {
  try {
    const v = BigInt(String(raw))
    if (v >= UNLIMITED_THRESHOLD || v === 2n ** 160n - 1n) return 'UNLIMITED'
    const t = token?.toLowerCase()
    const dec = t ? ctx?.tokenDecimals?.[t] : undefined
    const sym = t ? ctx?.tokenSymbols?.[t] : undefined
    return dec !== undefined ? `${formatUnits(v, dec)} ${sym ?? ''}`.trim() : `${v.toString()} base units`
  } catch {
    return String(raw)
  }
}

function deadlineText(raw: unknown): string {
  try {
    const v = Number(BigInt(String(raw)))
    if (v > 1e12) return 'never expires'
    return new Date(v * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  } catch {
    return String(raw)
  }
}

export interface ReviewTypedDataContext {
  expectedChainId: number
  tokenDecimals?: Record<string, number>
  tokenSymbols?: Record<string, string>
  knownContracts?: Record<string, string>
}

export function reviewTypedData(td: TypedDataPayload, ctx: ReviewTypedDataContext): SignReview {
  const findings: Finding[] = []
  const lines: { label: string; value: string }[] = []
  const d = td.domain ?? {}
  const label = (a?: string) => (a && isAddress(a) ? (ctx.knownContracts?.[a.toLowerCase()] ?? getAddress(a)) : (a ?? '—'))

  if (d.chainId !== undefined && Number(d.chainId) !== ctx.expectedChainId)
    findings.push({ code: 'chain-mismatch', severity: 'danger', message: `Signature is for chain ${d.chainId}, but InWIF is on chain ${ctx.expectedChainId}.` })
  lines.push({ label: 'App / contract', value: [d.name, d.verifyingContract ? label(d.verifyingContract) : undefined].filter(Boolean).join(' · ') || '—' })
  lines.push({ label: 'Type', value: td.primaryType })

  const m = td.message as Record<string, unknown>
  let title = 'Sign typed data'

  if (td.primaryType === 'Permit' && 'spender' in m) {
    // EIP-2612 (value) or DAI-style (allowed: bool)
    title = 'Token permit — grants spending rights'
    const token = d.verifyingContract
    const unlimited = 'allowed' in m ? m.allowed === true : amountText(m.value, token, ctx) === 'UNLIMITED'
    lines.push({ label: 'Token', value: label(token) })
    lines.push({ label: 'Spender', value: label(String(m.spender)) })
    lines.push({ label: 'Allowance', value: 'allowed' in m ? (m.allowed ? 'UNLIMITED' : 'revoke') : amountText(m.value, token, ctx) })
    lines.push({ label: 'Valid until', value: deadlineText(m.deadline ?? m.expiry) })
    findings.push({
      code: 'permit',
      severity: 'danger',
      message: 'This signature lets the spender take your tokens without any further confirmation. It is a common way to steal funds. Only sign if you started this action yourself on a site you trust.',
    })
    if (unlimited) findings.push({ code: 'unlimited-approval', severity: 'danger', message: 'The permit is for an UNLIMITED amount.' })
  } else if (PERMIT2_TYPES.has(td.primaryType)) {
    title = 'Permit2 signature — grants spending rights'
    const details = (m.details ?? m.permitted) as Record<string, unknown> | Record<string, unknown>[] | undefined
    const list = Array.isArray(details) ? details : details ? [details] : []
    for (const it of list) {
      lines.push({ label: 'Token', value: label(String(it.token)) })
      lines.push({ label: 'Amount', value: amountText(it.amount, String(it.token), ctx) })
    }
    lines.push({ label: 'Spender', value: label(String(m.spender ?? '—')) })
    lines.push({ label: 'Valid until', value: deadlineText(m.sigDeadline ?? m.deadline) })
    findings.push({
      code: 'permit2',
      severity: 'danger',
      message: 'This Permit2 signature authorises the spender to move your tokens. Only sign if you started this action yourself on a site you trust.',
    })
    if (list.some((it) => amountText(it.amount) === 'UNLIMITED')) findings.push({ code: 'unlimited-approval', severity: 'danger', message: 'The permit is for an UNLIMITED amount.' })
  } else {
    for (const [k, v] of Object.entries(m).slice(0, 12)) {
      lines.push({ label: k, value: typeof v === 'object' ? JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)).slice(0, 200) : String(v) })
    }
    if (d.verifyingContract && !ctx.knownContracts?.[d.verifyingContract.toLowerCase()])
      findings.push({ code: 'unknown-contract', severity: 'warning', message: 'Unrecognised contract. Make sure you trust the site asking for this signature.' })
  }
  findings.push(NOT_A_GUARANTEE)
  return { title, lines, findings, risk: riskOf(findings) }
}

export function isTypedDataForAccount(addressParam: unknown, account: Address): boolean {
  return typeof addressParam === 'string' && isAddress(addressParam) && getAddress(addressParam) === getAddress(account)
}
