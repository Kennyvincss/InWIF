/** Public-site check: pages load, no console errors, no horizontal overflow on phones, internal links resolve. */
import { chromium } from 'playwright'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined
const b = await chromium.launch({ proxy })
const pages = ['/', '/hardware', '/ecosystem', '/security', '/docs']
const links = new Set()
const problems = []
for (const w of [1360, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } })
  p.on('pageerror', (e) => problems.push(`pageerror @${w}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && problems.push(`console @${w}: ${m.text().slice(0, 160)}`))
  for (const path of pages) {
    const r = await p.goto(BASE + path)
    await p.waitForTimeout(800)
    if (r.status() !== 200) problems.push(`${path} HTTP ${r.status()}`)
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (over > 1) problems.push(`${path} @${w}px overflows horizontally by ${over}px`)
    for (const h of await p.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) links.add(h)
  }
  await p.close()
}
const p = await b.newPage()
for (const h of links) {
  const [path, hash] = h.split('#')
  const r = await p.goto(BASE + (path || '/'))
  if (r.status() !== 200) problems.push(`link ${h} → HTTP ${r.status()}`)
  // In-app anchors (/app/...) only exist once a wallet is set up; skip them here.
  if (hash && !path.startsWith('/app') && !(await p.locator(`[id="${hash}"]`).count())) problems.push(`link ${h} → anchor #${hash} missing`)
}
console.log(`checked ${pages.length} pages × 2 widths, ${links.size} internal links`)
console.log(problems.length ? problems.join('\n') : 'no problems found')
await b.close()
process.exit(problems.length ? 1 : 0)
