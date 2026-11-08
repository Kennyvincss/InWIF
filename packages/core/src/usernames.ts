import { getAddress, isAddress, recoverMessageAddress, type Address, type Hex } from 'viem'

/**
 * InWIF usernames (@name → address).
 *
 * A username is claimed by signing a plain-text message with the wallet's key. The
 * signature is free (no transaction) and the registry stores the signed claim as-is, so
 * every client re-verifies the signature itself: the server cannot invent a mapping for an
 * address it does not control.
 *
 * Rules:
 *  - 3–20 characters: lowercase letters, digits and underscore, starting with a letter.
 *  - A name, once claimed, belongs to that address forever (it is never handed to someone
 *    else, so old links and saved names never start paying a stranger).
 *  - Names that look alike (k3nny / kenny, inwif_supp0rt / inwif_support) are treated as
 *    the same name, so nobody can register a look-alike of someone else's name.
 *  - Official-sounding names are reserved.
 */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
/** How many names one address may claim (switching name keeps the old one for that address). */
export const USERNAMES_PER_ADDRESS = 3
/** A claim must be signed within this window of the server's clock. */
export const CLAIM_MAX_AGE_MS = 10 * 60_000

const PATTERN = /^[a-z][a-z0-9_]*$/

const RESERVED = [
  'inwif', 'wif', 'dogwifhat', 'robinhood', 'admin', 'administrator', 'support', 'help', 'helpdesk', 'official',
  'team', 'staff', 'mod', 'moderator', 'security', 'system', 'wallet', 'root', 'owner', 'dev', 'developer',
  'founder', 'ceo', 'null', 'undefined', 'anonymous', 'everyone', 'here', 'me', 'you', 'pay', 'send', 'receive',
  'swap', 'airdrop', 'giveaway', 'claim', 'reward', 'rewards', 'verify', 'verified', 'recovery', 'refund', 'treasury',
  'uniswap', 'ethereum', 'eth', 'bitcoin', 'btc', 'usdc', 'usdt', 'tether', 'binance', 'coinbase', 'metamask',
]

/** Characters that are easy to mistake for each other collapse to one form. */
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'l', i: 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '2': 'z', '6': 'b' }

/** The look-alike form used for uniqueness: k3nny, kenny and k_e_n_n_y all become "kenny". */
export function usernameSkeleton(name: string): string {
  return name
    .toLowerCase()
    .replace(/_/g, '')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .split('')
    .map((c) => LOOKALIKE[c] ?? c)
    .join('')
}

const RESERVED_SKELETONS = new Set(RESERVED.map(usernameSkeleton))
/** Names starting with these impersonate the project or its staff (inwif_team, official_x). */
const RESERVED_PREFIXES = ['inwif', 'admin', 'support', 'official', 'moderator'].map(usernameSkeleton)

export type UsernameCheck = { ok: true; username: string } | { ok: false; error: string }

/** Lower-case, drop a leading @ and validate. Does not check whether the name is taken. */
export function normaliseUsername(input: string): UsernameCheck {
  const name = input.trim().replace(/^@/, '').toLowerCase()
  if (!name) return { ok: false, error: 'Choose a username.' }
  if (name.length < USERNAME_MIN) return { ok: false, error: `At least ${USERNAME_MIN} characters.` }
  if (name.length > USERNAME_MAX) return { ok: false, error: `At most ${USERNAME_MAX} characters.` }
  if (!PATTERN.test(name)) return { ok: false, error: 'Use letters, numbers and _ only, starting with a letter.' }
  if (name.endsWith('_') || name.includes('__')) return { ok: false, error: 'Underscores go between letters or numbers.' }
  const skel = usernameSkeleton(name)
  if (RESERVED_SKELETONS.has(skel) || RESERVED_PREFIXES.some((p) => skel.startsWith(p))) return { ok: false, error: 'This name is reserved.' }
  if (/^0x/.test(name)) return { ok: false, error: 'Usernames cannot start with 0x.' }
  return { ok: true, username: name }
}

/** True when the input should be treated as a username rather than an address. */
export function looksLikeUsername(input: string): boolean {
  const s = input.trim()
  if (s.startsWith('@')) return true
  return !/^0x/i.test(s) && /^[a-z][a-z0-9_]{1,24}$/i.test(s)
}

export interface UsernameClaim {
  username: string
  address: Address
  /** ISO-8601 time the claim was signed. */
  issuedAt: string
  signature: Hex
}

/** The exact text the wallet signs. Human-readable so the user knows what they approve. */
export function usernameClaimMessage(c: { username: string; address: Address; issuedAt: string }): string {
  return [
    'InWIF username',
    '',
    `I am claiming @${c.username} for my address`,
    getAddress(c.address),
    '',
    `Issued: ${c.issuedAt}`,
    '',
    'This signature is free. It does not send a transaction or give access to your funds.',
  ].join('\n')
}

/** Recover the signer and check it matches the claimed address and the username rules. */
export async function verifyUsernameClaim(claim: unknown): Promise<{ ok: true; claim: UsernameClaim } | { ok: false; error: string }> {
  const c = claim as Partial<UsernameClaim> | null
  if (!c || typeof c !== 'object') return { ok: false, error: 'Missing claim.' }
  if (typeof c.username !== 'string' || typeof c.address !== 'string' || typeof c.issuedAt !== 'string' || typeof c.signature !== 'string') {
    return { ok: false, error: 'Malformed claim.' }
  }
  const n = normaliseUsername(c.username)
  if (!n.ok) return n
  if (n.username !== c.username) return { ok: false, error: 'Username is not in its normal form.' }
  if (!isAddress(c.address, { strict: false })) return { ok: false, error: 'Invalid address.' }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(c.issuedAt) || Number.isNaN(Date.parse(c.issuedAt))) {
    return { ok: false, error: 'Invalid time.' }
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(c.signature)) return { ok: false, error: 'Invalid signature.' }
  const address = getAddress(c.address)
  try {
    const signer = await recoverMessageAddress({ message: usernameClaimMessage({ username: n.username, address, issuedAt: c.issuedAt }), signature: c.signature as Hex })
    if (signer !== address) return { ok: false, error: 'The signature is not from this address.' }
  } catch {
    return { ok: false, error: 'Invalid signature.' }
  }
  return { ok: true, claim: { username: n.username, address, issuedAt: c.issuedAt, signature: c.signature as Hex } }
}

/** Build and sign a claim. `sign` is the wallet's personal_sign (EIP-191) for `address`. */
export async function createUsernameClaim(username: string, address: Address, sign: (message: string) => Promise<Hex>, now = new Date()): Promise<UsernameClaim> {
  const n = normaliseUsername(username)
  if (!n.ok) throw new Error(n.error)
  const issuedAt = now.toISOString()
  const a = getAddress(address)
  const signature = await sign(usernameClaimMessage({ username: n.username, address: a, issuedAt }))
  return { username: n.username, address: a, issuedAt, signature }
}

export type ClaimRefusal = 'taken' | 'similar' | 'limit' | 'reserved' | 'invalid' | 'stale'

export const CLAIM_REFUSAL_TEXT: Record<ClaimRefusal, string> = {
  taken: 'That username is taken.',
  similar: 'That username is too close to one that is taken.',
  limit: `This address already has ${USERNAMES_PER_ADDRESS} usernames.`,
  reserved: 'This name is reserved.',
  invalid: 'That username is not valid.',
  stale: 'The signature has expired. Please try again.',
}
