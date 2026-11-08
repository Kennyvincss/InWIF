import 'server-only'
import { USERNAMES_PER_ADDRESS, usernameSkeleton, type ClaimRefusal, type UsernameClaim } from '@inwif/core'
import { redis, redisConfigured } from './redis'

/**
 * Username registry storage.
 *
 *   inwif:u:n:<name>     → signed claim (JSON). Never deleted or reassigned.
 *   inwif:u:s:<skeleton> → owner address: blocks look-alikes of a taken name.
 *   inwif:u:a:<address>  → the address's current claim (reverse lookup).
 *   inwif:u:c:<address>  → how many names the address has claimed.
 *
 * Claims are checked and written in one Lua script, so two people can never both get a
 * name (or two look-alike names) at the same moment.
 *
 * Without Redis (local development and tests) an in-memory store with the same rules is
 * used. On Vercel without Redis the registry refuses to run rather than keep names in
 * memory that would vanish.
 */
const K = {
  name: (n: string) => `inwif:u:n:${n}`,
  skel: (n: string) => `inwif:u:s:${usernameSkeleton(n)}`,
  addr: (a: string) => `inwif:u:a:${a.toLowerCase()}`,
  count: (a: string) => `inwif:u:c:${a.toLowerCase()}`,
}

const CLAIM_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then
  local c = cjson.decode(existing)
  if string.lower(c.address) == ARGV[2] then
    redis.call('SET', KEYS[3], existing)
    return 'ok'
  end
  return 'taken'
end
local owner = redis.call('GET', KEYS[2])
if owner and owner ~= ARGV[2] then return 'similar' end
local n = tonumber(redis.call('GET', KEYS[4]) or '0')
if n >= tonumber(ARGV[3]) then return 'limit' end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[1])
redis.call('INCR', KEYS[4])
return 'ok'
`

const mem = new Map<string, string>()
const useMemory = () => !redisConfigured() && !process.env.VERCEL

export const registryAvailable = () => redisConfigured() || useMemory()

async function get(key: string): Promise<string | null> {
  if (useMemory()) return mem.get(key) ?? null
  return redis<string | null>(['GET', key])
}

function parse(v: string | null): UsernameClaim | null {
  if (!v) return null
  try {
    return JSON.parse(v) as UsernameClaim
  } catch {
    return null
  }
}

export async function claimByName(name: string) {
  return parse(await get(K.name(name)))
}

export async function claimByAddress(address: string) {
  return parse(await get(K.addr(address)))
}

/** Current claims for up to 50 addresses in one round trip (Activity). */
export async function claimsByAddresses(addresses: string[]): Promise<(UsernameClaim | null)[]> {
  if (!addresses.length) return []
  const keys = addresses.map(K.addr)
  const vals = useMemory() ? keys.map((k) => mem.get(k) ?? null) : await redis<(string | null)[]>(['MGET', ...keys])
  return vals.map(parse)
}

/** Owner address of a look-alike of `name`, if one is taken. */
export async function lookalikeOwner(name: string) {
  return get(K.skel(name))
}

export async function storeClaim(c: UsernameClaim): Promise<'ok' | ClaimRefusal> {
  const json = JSON.stringify({ username: c.username, address: c.address, issuedAt: c.issuedAt, signature: c.signature })
  const owner = c.address.toLowerCase()
  const keys = [K.name(c.username), K.skel(c.username), K.addr(c.address), K.count(c.address)]
  if (!useMemory()) {
    return redis<'ok' | ClaimRefusal>(['EVAL', CLAIM_LUA, keys.length, ...keys, json, owner, USERNAMES_PER_ADDRESS])
  }
  // Same rules as the Lua script (single-threaded, so this is atomic too).
  const existing = mem.get(keys[0])
  if (existing) {
    if (parse(existing)?.address.toLowerCase() !== owner) return 'taken'
    mem.set(keys[2], existing)
    return 'ok'
  }
  const sk = mem.get(keys[1])
  if (sk && sk !== owner) return 'similar'
  const n = Number(mem.get(keys[3]) ?? 0)
  if (n >= USERNAMES_PER_ADDRESS) return 'limit'
  mem.set(keys[0], json)
  mem.set(keys[1], owner)
  mem.set(keys[2], json)
  mem.set(keys[3], String(n + 1))
  return 'ok'
}
