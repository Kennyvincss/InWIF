import 'server-only'
import { NextResponse } from 'next/server'
import { normaliseUsername } from '@inwif/core'
import { claimByName } from '@/server/names'

export const NO_STORE = { 'cache-control': 'no-store' }
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
export const unavailable = () => json({ error: 'Sign-in is unavailable right now. Try again in a moment.' }, 503)

export async function readBody<T>(req: Request, max = 8_000): Promise<T | null> {
  const t = await req.text()
  if (t.length > max) return null
  try {
    return JSON.parse(t) as T
  } catch {
    return null
  }
}

/** @name (any name the address has ever claimed) → address. */
export async function addressForUsername(input: unknown): Promise<string | null> {
  if (typeof input !== 'string') return null
  const n = normaliseUsername(input)
  if (!n.ok) return null
  return (await claimByName(n.username))?.address ?? null
}
