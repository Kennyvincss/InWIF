/**
 * E2E for the five $WIF features against live mainnet data (read-only; nothing is sent):
 *   1. Installable app (manifest, service worker, offline page)
 *   2. Live $WIF terminal
 *   3. Shareable $WIF holder card
 *   4. Payment requests (create on Receive → /pay → Send prefilled)
 *   5. Token safety check
 *
 *   pnpm build && pnpm start &   (production build: the service worker only registers there)
 *   NODE_USE_ENV_PROXY=1 node e2e/features.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const WATCH = '0x156064f872eb6dedc953e7af21e7a7991910ef09' // holds ~9.3M WIF
const WIF = '0x5173b8eA6923c2d40267890D45C46a3480954773'
const ok = (m) => console.log(`  ✓ ${m}`)
const fail = (m) => {
  throw new Error(`ASSERT: ${m}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  console.log('1. Installable app')
  await page.goto(`${BASE}/`)
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  if (manifest.display !== 'standalone' || !manifest.icons.some((i) => i.purpose === 'maskable') || manifest.shortcuts?.length < 3) fail('manifest incomplete')
  ok(`manifest: standalone, ${manifest.icons.length} icons incl. maskable, ${manifest.shortcuts.length} shortcuts`)
  await page.goto(`${BASE}/app`)
  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 20000 })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 })
  ok('service worker registered and controlling the page')
  await ctx.setOffline(true)
  await page.goto(`${BASE}/app/swap`).catch(() => {})
  await page.getByText('You’re offline').waitFor({ timeout: 10000 })
  ok('offline: friendly offline page instead of a browser error')
  await ctx.setOffline(false)

  console.log('Set up a watch-only wallet')
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Watch an address/ }).click()
  await page.getByLabel('Address to watch').fill(WATCH)
  await page.getByRole('button', { name: 'Add watch-only wallet' }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()

  console.log('2. Live $WIF terminal')
  await page.locator('aside').getByRole('link', { name: 'Live $WIF', exact: true }).click()
  await page.getByText('Trade feed').waitFor()
  await page.locator('main li span', { hasText: /^(buy|sell)$/ }).first().waitFor({ timeout: 45000 })
  const rows = await page.locator('main li span', { hasText: /^(buy|sell)$/ }).count()
  if (rows < 5) fail(`only ${rows} trades in the feed`)
  const pressure = await page.locator('section', { hasText: 'Buy vs sell pressure' }).locator('p.font-display').first().textContent()
  ok(`live feed shows ${rows} real trades; buy pressure ${pressure}`)
  if (!(await page.getByText(/updated \d+s ago/i).count())) fail('no live update indicator')
  ok('live indicator ticking')
  await page.screenshot({ path: `${OUT}/feature-live.png` })

  console.log('3. $WIF holder card')
  await page.goto(`${BASE}/app/wif/card`)
  const card = page.locator('canvas[aria-label^="$WIF holder card"]')
  await card.waitFor({ timeout: 45000 })
  const label = await card.getAttribute('aria-label')
  if (!/Shark|Whale|Dolphin/.test(label ?? '')) fail(`unexpected tier: ${label}`)
  const pixels = await card.evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 200) lit++
    return { w: c.width, h: c.height, lit }
  })
  if (pixels.w !== 1200 || pixels.h !== 630 || pixels.lit < 50) fail(`card not drawn ${JSON.stringify(pixels)}`)
  ok(`card drawn (${label}, 1200×630)`)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()])
  if (download.suggestedFilename() !== 'my-wif-card.png') fail('download name')
  ok('card downloads as my-wif-card.png')
  const x = await page.getByRole('link', { name: 'Post on X' }).getAttribute('href')
  if (!x?.startsWith('https://x.com/intent/post?text=')) fail('X intent link')
  ok('Post on X opens a prefilled draft')
  await page.screenshot({ path: `${OUT}/feature-card.png` })

  console.log('4. Payment requests')
  await page.locator('aside').getByRole('link', { name: 'Receive', exact: true }).click()
  await page.getByLabel('Amount (optional)').fill('5000')
  await page.getByLabel('Note (optional)').fill('Pizza night')
  const link = await page.locator('p.font-mono', { hasText: '/pay?' }).first().textContent()
  if (!link?.includes('token=WIF') || !link.includes('amount=5000')) fail(`bad link ${link}`)
  ok(`request link created: ${link.replace(/^https?:\/\/[^/]+/, '')}`)
  await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE))
  await page.getByText('Payment request', { exact: false }).first().waitFor()
  if (!(await page.getByText('5,000').count()) || !(await page.getByText('“Pizza night”').count())) fail('pay page content')
  ok('pay page shows 5,000 WIF and the note')
  await page.screenshot({ path: `${OUT}/feature-pay.png` })
  await page.getByRole('link', { name: /Pay with InWIF/ }).click()
  await page.getByText('Filled in from a payment request').waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: 'Asset' }).filter({ hasText: 'WIF' }).waitFor({ timeout: 30000 })
  const to = await page.getByLabel('Recipient address').inputValue()
  const amt = await page.getByLabel('Amount').inputValue()
  const asset = await page.getByRole('button', { name: 'Asset' }).textContent()
  if (to.toLowerCase() !== WATCH || amt !== '5000' || !asset?.includes('WIF')) fail(`prefill ${to} ${amt} ${asset}`)
  ok('Send is prefilled: recipient, 5000, WIF')
  await page.goto(`${BASE}/pay?to=0x123&token=WIF`)
  await page.getByText(/This link doesn.t work/).waitFor()
  await page.goto(`${BASE}/pay?to=${WATCH}&token=SCAM&amount=1`)
  await page.getByText('does not recognise').waitFor()
  ok('invalid and unknown-token links are refused')

  console.log('5. Token safety check')
  await page.goto(`${BASE}/app/check`)
  await page.getByLabel('Token address').fill(WIF)
  await page.getByRole('button', { name: /Check token/ }).click()
  await page.getByText(/Low risk|Be careful|High risk/).first().waitFor({ timeout: 60000 })
  const verdict = await page.getByText(/Low risk|Be careful|High risk/).first().textContent()
  if (verdict !== 'Low risk') fail(`WIF verdict ${verdict}`)
  if (!(await page.getByText(/Transfers work/).count())) fail('transfer test missing')
  ok('$WIF: Low risk, transfers simulated from real holders')
  await page.screenshot({ path: `${OUT}/feature-check.png` })
  await page.getByLabel('Token address').fill(WATCH)
  await page.getByRole('button', { name: /Check token/ }).click()
  await page.getByText('High risk').waitFor({ timeout: 60000 })
  ok('a non-token contract is High risk')

  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
  ok('no uncaught page errors')
  console.log('\nFeatures E2E passed')
} catch (e) {
  await page.screenshot({ path: `${OUT}/features-failure.png` }).catch(() => {})
  console.error('FAILED:', String(e.message).split('\n')[0])
  process.exitCode = 1
} finally {
  await browser.close()
}
