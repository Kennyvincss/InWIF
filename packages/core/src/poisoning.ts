import { getAddress, isAddress, type Address } from 'viem'
import type { ActivityItem } from './activity'

/**
 * Address-poisoning protection.
 *
 * The scam: an attacker creates an address whose first and last characters match one the
 * victim uses (0x1560…ef09 vs 0x1560…ef09-but-different-middle), then puts it in the
 * victim's history with a $0 transfer, a dust transfer or a fake-token transfer. Later the
 * victim copies "the address I used last time" from their history and pays the attacker.
 *
 * Everything here runs on the device from the user's own history; nothing is sent anywhere.
 */

const hex = (a: string) => a.toLowerCase().replace(/^0x/, '')

/** How many leading and trailing hex characters two addresses share. */
export function sharedEnds(a: string, b: string): { prefix: number; suffix: number } {
  const x = hex(a)
  const y = hex(b)
  let prefix = 0
  while (prefix < 40 && x[prefix] === y[prefix]) prefix++
  let suffix = 0
  while (suffix < 40 && x[39 - suffix] === y[39 - suffix]) suffix++
  return { prefix, suffix }
}

/**
 * True when two different addresses share enough of their start and end to be mistaken for
 * each other (at least 3 + 3 and 7 in total). By chance this happens for roughly one pair
 * of random addresses in tens of millions, so a match is almost certainly made on purpose.
 */
export function addressesLookAlike(a: string, b: string): boolean {
  if (!isAddress(a, { strict: false }) || !isAddress(b, { strict: false })) return false
  if (hex(a) === hex(b)) return false
  const { prefix, suffix } = sharedEnds(a, b)
  return prefix >= 3 && suffix >= 3 && prefix + suffix >= 7
}

/** The trusted address that `target` imitates, if any. */
export function findLookalike(target: string, trusted: Iterable<string>): Address | undefined {
  for (const t of trusted) if (addressesLookAlike(target, t)) return getAddress(t)
  return undefined
}

/**
 * Addresses the user really deals with: their own accounts, saved usernames, and recipients
 * of their own successful outgoing payments. Outgoing token transfers only count for known
 * tokens with a non-zero amount, because a fake token can emit a "transfer from you" that you
 * never made.
 */
export function trustedCounterparties(
  items: ActivityItem[],
  ctx: { self: Address[]; knownTokens: Address[]; extra?: string[] },
): Set<string> {
  const known = new Set(ctx.knownTokens.map((t) => t.toLowerCase()))
  const out = new Set<string>([...ctx.self, ...(ctx.extra ?? [])].map((a) => a.toLowerCase()))
  for (const i of items) {
    if (i.direction !== 'out' || i.status !== 'success' || !i.to) continue
    const genuine = i.kind === 'native' || (i.kind === 'token' && !!i.tokenAddress && known.has(i.tokenAddress.toLowerCase()) && BigInt(i.value) > 0n)
    if (genuine) out.add(i.to.toLowerCase())
  }
  return out
}

export type ScamReason = 'zero-value' | 'fake-token' | 'spam-token' | 'lookalike'

export interface ScamFlag {
  reason: ScamReason
  message: string
  /** For look-alikes: the real address being imitated. */
  imitates?: Address
}

const URLISH = /(https?:|www\.|\.(com|io|xyz|org|net|app|top|site|live|claim)\b|t\.me\/|claim|reward|airdrop|visit)/i

/**
 * Flag history entries that look like poisoning or spam. Only token transfers and incoming
 * native transfers can be planted by someone else; a native payment the user sent is real.
 */
export function flagActivity(
  items: ActivityItem[],
  ctx: { self: Address[]; knownTokens: { address: Address; symbol: string }[]; trusted: Set<string> },
): Map<ActivityItem, ScamFlag> {
  const flags = new Map<ActivityItem, ScamFlag>()
  const knownAddr = new Set(ctx.knownTokens.map((t) => t.address.toLowerCase()))
  const knownSym = new Map(ctx.knownTokens.map((t) => [t.symbol.toUpperCase(), t]))
  const selfSet = new Set(ctx.self.map((a) => a.toLowerCase()))

  for (const i of items) {
    if (i.kind === 'contract') continue
    if (i.kind === 'native' && i.direction === 'out') continue // signed by the user
    const other = i.direction === 'in' ? i.from : i.to

    if (i.kind === 'token' && i.tokenAddress && !knownAddr.has(i.tokenAddress.toLowerCase())) {
      const sym = (i.symbol || '').toUpperCase()
      const real = knownSym.get(sym) ?? knownSym.get(sym.replace(/[^A-Z0-9]/g, ''))
      if (real) {
        flags.set(i, { reason: 'fake-token', message: `Fake ${real.symbol}: this is not the real ${real.symbol} token.` })
        continue
      }
      if (URLISH.test(i.symbol || '')) {
        flags.set(i, { reason: 'spam-token', message: 'Spam token advertising a website. Never visit it or interact with it.' })
        continue
      }
    }
    if (i.kind === 'token' && i.value === '0') {
      flags.set(i, { reason: 'zero-value', message: 'A $0 transfer. Scammers send these so a fake address shows up in your history.' })
      continue
    }
    if (other && !selfSet.has(other.toLowerCase()) && !ctx.trusted.has(other.toLowerCase())) {
      const imitates = findLookalike(other, ctx.trusted)
      if (imitates) {
        flags.set(i, {
          reason: 'lookalike',
          imitates,
          message: `Look-alike address imitating ${imitates.slice(0, 6)}…${imitates.slice(-4)}, which you have used. Never copy addresses from this entry.`,
        })
      }
    }
  }
  return flags
}
