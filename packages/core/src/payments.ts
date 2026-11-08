/**
 * Payment requests ("Pay me 5,000 WIF"): a shareable link that opens InWIF with the
 * recipient, token and amount filled in. Everything in the link is validated before it
 * is shown or used — a link is untrusted input, so the payer still reviews and confirms.
 */
import { getAddress, isAddress, parseUnits, type Address } from 'viem'
import type { TokenInfo } from './tokens'

export const PAYMENT_NOTE_MAX = 80

export interface PaymentRequest {
  to: Address
  /** 'native' or a token address from the network's known token list. */
  asset: 'native' | Address
  symbol: string
  decimals: number
  /** Decimal string as the requester typed it (validated), or undefined for "any amount". */
  amount?: string
  note?: string
}

export type PaymentParse = { ok: true; request: PaymentRequest } | { ok: false; error: string }

/** Strip control characters and trim a free-text note. */
export function cleanNote(input: string | null | undefined): string | undefined {
  if (!input) return undefined
  // eslint-disable-next-line no-control-regex
  const s = input.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim()
  return s ? s.slice(0, PAYMENT_NOTE_MAX) : undefined
}

function checkAmount(amount: string, decimals: number): string | null {
  if (!/^\d+(\.\d+)?$/.test(amount)) return 'The amount is not a valid number.'
  const frac = amount.split('.')[1] ?? ''
  if (frac.length > decimals) return `The amount has more than ${decimals} decimal places.`
  if (parseUnits(amount, decimals) <= 0n) return 'The amount must be greater than zero.'
  if (amount.replace('.', '').replace(/^0+/, '').length > 40) return 'The amount is too large.'
  return null
}

/**
 * Parse and validate request parameters (from a URL). `token` is a symbol ("WIF", "ETH")
 * or a token address; only the network's native coin and its known tokens are accepted, so
 * a link cannot make an unknown token look legitimate.
 */
export function parsePaymentRequest(
  params: { to?: string | null; token?: string | null; amount?: string | null; note?: string | null },
  ctx: { tokens: TokenInfo[]; nativeSymbol: string },
): PaymentParse {
  const to = params.to?.trim()
  if (!to || !isAddress(to, { strict: false })) return { ok: false, error: 'This payment link has no valid recipient address.' }
  if (/^0x0{40}$/i.test(to)) return { ok: false, error: 'This payment link points to the zero address.' }

  const t = (params.token ?? ctx.nativeSymbol).trim()
  let asset: PaymentRequest['asset']
  let symbol: string
  let decimals: number
  if (t.toUpperCase() === ctx.nativeSymbol.toUpperCase() || t.toLowerCase() === 'native') {
    asset = 'native'
    symbol = ctx.nativeSymbol
    decimals = 18
  } else {
    const match = ctx.tokens.find((k) => k.symbol.toUpperCase() === t.toUpperCase() || (isAddress(t, { strict: false }) && getAddress(t) === getAddress(k.address)))
    if (!match) return { ok: false, error: 'This payment link asks for a token InWIF does not recognise.' }
    asset = getAddress(match.address)
    symbol = match.symbol
    decimals = match.decimals
  }

  const amount = params.amount?.trim() || undefined
  if (amount) {
    const err = checkAmount(amount, decimals)
    if (err) return { ok: false, error: err }
  }
  return { ok: true, request: { to: getAddress(to), asset, symbol, decimals, amount, note: cleanNote(params.note) } }
}

/** Shareable link for a request, e.g. https://inwif.app/pay?to=0x…&token=WIF&amount=5000 */
export function buildPaymentLink(origin: string, r: { to: Address; symbol: string; amount?: string; note?: string }): string {
  const u = new URL('/pay', origin)
  u.searchParams.set('to', getAddress(r.to))
  u.searchParams.set('token', r.symbol)
  if (r.amount) u.searchParams.set('amount', r.amount)
  const note = cleanNote(r.note)
  if (note) u.searchParams.set('note', note)
  return u.toString()
}
