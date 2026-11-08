/**
 * Read-only live check of the web wallet against Robinhood Chain mainnet.
 * Adds a watch-only wallet for a public address and verifies real data renders.
 *   node e2e/live-mainnet.mjs     (server running on :3000)
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const WATCH = process.env.WATCH_ADDRESS ?? '0x156064f872eb6dedc953e7af21e7a7991910ef09' // Uniswap V3 WIF/WETH 1% pool
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined

const browser = await chromium.launch({ proxy })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: Number(process.env.SHOT_SCALE ?? 1), ignoreHTTPSErrors: false })
const ok = (m) => console.log(`  ✓ ${m}`)
// Which RPC path does the browser use? (relay = /api/rpc, direct = public RPC hosts)
const rpcPaths = { relay: 0, direct: 0 }
page.on('request', (r) => {
  if (r.method() !== 'POST') return
  const u = r.url()
  if (u.includes('/api/rpc/')) rpcPaths.relay++
  else if (/chain\.robinhood\.com|publicnode\.com/.test(u)) rpcPaths.direct++
})
try {
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Watch an address/ }).click()
  await page.getByLabel('Address to watch').fill(WATCH)
  await page.getByRole('button', { name: 'Add watch-only wallet' }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()
  await page.getByText('World is Flat').first().waitFor({ timeout: 30000 })
  await page.waitForFunction(() => /\$[0-9,]+\.\d\d/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 30000 })
  ok('portfolio value computed from live balances and prices')
  const chart = async (label) => {
    try {
      await page.locator('svg[role="img"]').first().waitFor({ timeout: 45000 })
      ok(`${label} chart rendered from real price history`)
    } catch {
      const t = await page.locator('main').innerText()
      console.log(/unavailable right now/.test(t) ? `  ! ${label} chart: price data provider rate-limited this IP (UI says so)` : `  ✗ ${label} chart missing`)
      if (!/unavailable right now/.test(t)) process.exitCode = 1
    }
  }
  await chart('portfolio')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/live-dashboard.png` })
  await page.locator('aside').getByRole('link', { name: 'Security', exact: true }).click()
  await page.getByText('✓ Network verified').waitFor({ timeout: 30000 })
  ok('live mainnet network verified (Security Centre)')
  if (await page.getByText('Network issue').count()) throw new Error('top bar reports a network issue')

  await page.locator('aside').getByRole('link', { name: '$WIF', exact: true }).click()
  await page.getByText('verified on-chain').waitFor({ timeout: 30000 })
  ok('$WIF metadata verified on-chain against the listing')
  await chart('$WIF price')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/live-wif.png` })
  const holders = await page.locator('text=Holders').locator('..').innerText()
  console.log(`  · ${holders.replace(/\n/g, ' ')}`)

  await page.locator('aside').getByRole('link', { name: 'Swap', exact: true }).click()
  await page.getByLabel('Amount to swap').fill('0.01')
  await page.getByText('Minimum received').waitFor({ timeout: 30000 })
  const vsMarket = await page.getByText(/% (below|above)$/).first().textContent({ timeout: 30000 }).catch(() => 'no market price')
  // The dead V3 pool gives ~20% below market; the main $WIF market ~1% (its trading fee).
  if (/below/.test(vsMarket ?? '') && parseFloat(vsMarket ?? '0') > 3) throw new Error(`quote is ${vsMarket} market: wrong route`)
  ok(`live quote ETH → WIF at the main $WIF market; vs market: ${vsMarket}`)
  for (const t of ['Uniswap', 'GeckoTerminal', 'Pons']) if ((await page.locator('main').innerText()).includes(t)) throw new Error(`swap page names a provider: ${t}`)
  ok('swap page names no providers')
  await page.screenshot({ path: `${OUT}/live-swap.png` })

  await page.locator('aside').getByRole('link', { name: 'Activity', exact: true }).click()
  await page.locator('main li').first().waitFor({ timeout: 90000 })
  const act = await page.locator('main').innerText()
  const rows = await page.locator('main li').count()
  ok(`activity shows ${rows} real transfers ${/Showing your recent token transfers/.test(act) ? '(RPC log fallback — explorer blocked here)' : '(Blockscout)'}`)
  await page.screenshot({ path: `${OUT}/live-activity.png` })
  console.log(`  · browser RPC requests: ${rpcPaths.relay} via InWIF relay, ${rpcPaths.direct} direct to public RPCs`)
  console.log(process.exitCode ? '\nLive mainnet check FAILED' : '\nLive mainnet check passed')
} catch (e) {
  console.error('FAILED:', String(e.message).split('\n')[0])
  await page.screenshot({ path: `${OUT}/live-failure.png` }).catch(() => {})
  console.error((await page.locator('main').innerText().catch(() => '')).slice(0, 1200))
  process.exitCode = 1
} finally {
  await browser.close()
}
