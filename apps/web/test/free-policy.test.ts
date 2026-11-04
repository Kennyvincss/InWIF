/**
 * Guardrail: InWIF must never ship subscription, paywall or payment-gating code.
 * Scans every source file in the monorepo for identifiers that would indicate it.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { ECOSYSTEM_APPS } from '@/lib/ecosystem'

const ROOT = path.resolve(__dirname, '../../..')
const SKIP = new Set(['node_modules', '.next', 'lib', 'out', 'cache', 'target', '.git', 'screens', '.expo'])
const EXT = /\.(ts|tsx|js|mjs|sol|rs|sql)$/

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(f) && !p.includes('free-policy.test')) out.push(p)
  }
  return out
}

const FORBIDDEN = [
  /subscriptionmanager/i,
  /premium(tier|plan|member|feature)/i,
  /\bpaywall\s*\(/i,
  /requirePayment|requireSubscription|isPremium|isSubscribed/,
  /stripe|checkout\.session|in_app_purchase/i,
  /PaidAccess|FeatureUnlock|MembershipContract/,
  /serviceFeeBps\s*:\s*[1-9]/,
]

describe('free product policy', () => {
  const files = walk(ROOT)
  it('scans the codebase', () => expect(files.length).toBeGreaterThan(30))
  it('contains no subscription / paywall / payment-gating code', () => {
    const hits: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const re of FORBIDDEN) if (re.test(src)) hits.push(`${path.relative(ROOT, f)} matches ${re}`)
    }
    expect(hits).toEqual([])
  })
  it('lists no ecosystem app that requires payment', () => {
    for (const a of ECOSYSTEM_APPS) expect(a.description.toLowerCase()).not.toMatch(/subscription|premium|pay to/)
  })
})
