/**
 * Records the InWIF demo (one take, every feature) on a Robinhood Chain mainnet fork.
 * Not a test. Run on an X display (Xvfb :99) with ffmpeg capturing the screen.
 * Writes timeline.json: for every scene the kept segment [start, end] (seconds since capture
 * start) and loading waits to cut out.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, defineChain, encodeFunctionData, erc20Abi, getAddress, http, parseEther, toHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const DIR = process.env.VIDEO_DIR
const BASE = 'http://127.0.0.1:3000'
const RPC = 'http://127.0.0.1:8545'
const L1 = 'http://127.0.0.1:8546'
const WIF = '0x5173b8eA6923c2d40267890D45C46a3480954773'
const WHALE = '0x156064f872eb6dedc953e7af21e7a7991910ef09'
const PW = 'wif to the moon 2026'
const NAME = 'wifholder'
const NEW_NAME = 'wifking'
const DUR = JSON.parse(readFileSync(`${DIR}/audio/durations.json`, 'utf8'))

const chain = defineChain({ id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const pub = createPublicClient({ chain, transport: http(RPC) })
const l1 = createPublicClient({ transport: http(L1) })
const transfer = (to, amount) => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] })
async function as(from, to, data) {
  await pub.request({ method: 'anvil_impersonateAccount', params: [from] })
  const hash = await pub.request({ method: 'eth_sendTransaction', params: [{ from, to, data }] })
  await pub.waitForTransactionReceipt({ hash })
  await pub.request({ method: 'anvil_stopImpersonatingAccount', params: [from] })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const retry = async (f, n = 5) => { for (let i = 1; ; i++) { try { return await f() } catch (e) { if (i >= n) throw e; await sleep(2000 * i) } } }
// Both forks must answer for a fresh address (state is fetched from the real chains).
const probe = privateKeyToAccount(generatePrivateKey()).address
console.log('forks ok', await retry(() => pub.getBalance({ address: probe })), await retry(() => l1.request({ method: 'eth_getBalance', params: [probe, 'latest'] })))

// ---- Off-camera set-up: a friend, @sarah, with a real claimed username and some $WIF.
const sarahKey = generatePrivateKey()
const sarah = privateKeyToAccount(sarahKey)
const fake = getAddress(`0x${sarah.address.slice(2, 7)}${'3'.repeat(30)}${sarah.address.slice(-5)}`.toLowerCase())
for (const a of [sarah.address, WHALE, fake]) await pub.request({ method: 'anvil_setBalance', params: [a, toHex(parseEther('1'))] })
await as(WHALE, WIF, transfer(sarah.address, parseEther('50000')))
{
  const issuedAt = new Date().toISOString()
  const message = ['InWIF username', '', `I am claiming @sarah for my address`, sarah.address, '', `Issued: ${issuedAt}`, '', 'This signature is free. It does not send a transaction or give access to your funds.'].join('\n')
  const claim = { username: 'sarah', address: sarah.address, issuedAt, signature: await sarah.signMessage({ message }) }
  const r = await fetch(`${BASE}/api/names`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim }) })
  console.log('claimed @sarah', r.status)
}

// ---- Browser on the X display, full screen, with a visible cursor.
const browser = await chromium.launch({
  headless: false,
  args: ['--window-position=0,0', '--window-size=1536,864', '--force-device-scale-factor=1.25', '--hide-scrollbars', '--disable-infobars', '--no-first-run', '--disable-features=Translate'],
})
const CURSOR = `
(() => {
  const add = () => {
    if (document.getElementById('__demo_cursor')) return
    const c = document.createElement('div')
    c.id = '__demo_cursor'
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15.5 L12.5 22 L15.5 20.6 L12.2 14.2 L19 14.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)', transition: 'none' })
    const r = document.createElement('div')
    r.id = '__demo_ripple'
    Object.assign(r.style, { position: 'fixed', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(232,98,44,.35)', zIndex: 2147483646, pointerEvents: 'none', transform: 'translate(-18px,-18px) scale(0)', transition: 'transform .35s ease, opacity .45s ease', opacity: 0 })
    document.documentElement.append(c, r)
    const pos = (window.top.__demoPos ||= { x: -100, y: -100 })
    c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px'
    addEventListener('mousemove', (e) => { pos.x = e.clientX; pos.y = e.clientY; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
    addEventListener('mousedown', (e) => {
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.style.transition = 'none'; r.style.opacity = 1; r.style.transform = 'translate(-18px,-18px) scale(.3)'
      requestAnimationFrame(() => { r.style.transition = 'transform .35s ease, opacity .45s ease'; r.style.transform = 'translate(-18px,-18px) scale(1.4)'; r.style.opacity = 0 })
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add()
  new MutationObserver(() => { if (!document.getElementById('__demo_cursor') && document.documentElement) add() }).observe(document, { childList: true, subtree: true })
})()`
async function newWindow() {
  const ctx = await browser.newContext({ viewport: null, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(CURSOR)
  // The demo wallet is brand new on a fork, so the public explorer has no history for it:
  // read its history from the chain itself (the app's built-in fallback).
  await ctx.route((u) => u.pathname.includes('/addresses/'), (route) => route.fulfill({ status: 503, body: 'unavailable' }))
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } })
  p.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 160)))
  p.setDefaultTimeout(60000)
  return p
}
let page = await newWindow()
await page.goto(`${BASE}/`)
await page.getByText('Your crypto.').first().waitFor()
await sleep(1500)

// ---- Helpers
const at = { x: 1200, y: 700 }
async function moveTo(loc, steps = 22) {
  await loc.waitFor({ state: 'visible' })
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  if (!b) return
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2
  await page.mouse.move(x, y, { steps })
  at.x = x; at.y = y
  await sleep(180)
}
async function click(loc) {
  await moveTo(loc)
  await loc.click()
  await sleep(350)
}
async function type(loc, text, delay = 55) {
  await click(loc)
  await loc.pressSequentially(text, { delay })
  await sleep(250)
}
async function hover(loc, ms = 900) {
  if (await loc.count()) { await moveTo(loc.first()); await sleep(ms) }
}
async function scroll(total, ms = 3000) {
  const steps = Math.max(1, Math.round(ms / 60))
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, total / steps); await sleep(60) }
}
async function park() { await page.mouse.move(1450, 760, { steps: 15 }) }

// ---- Screen capture
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-framerate', '30', '-video_size', '1920x1080', '-draw_mouse', '0', '-i', `${process.env.DISPLAY}.0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', `${DIR}/raw.mkv`], { stdio: ['pipe', 'inherit', 'inherit'] })
const t0 = Date.now() + 350 // ffmpeg start-up
const now = () => (Date.now() - t0) / 1000
const timeline = []
let cuts = []
/** Wait for something without it ending up in the video. */
async function cut(fn) {
  const a = now()
  try { await fn() } finally { const b = now(); if (b - a > 0.8) cuts.push([a + 0.3, b - 0.1]) }
}

async function scene(id, prep, act) {
  console.log(`scene ${id}`)
  try { if (prep) await prep() } catch (e) { console.log(`  prep failed: ${String(e.message).split('\n')[0]}`) }
  cuts = []
  const start = now()
  const need = (DUR[`long_${id}`] ?? 4) + 0.9
  let ok = true
  try { await act() } catch (e) { ok = false; console.log(`  act failed: ${String(e.message).split('\n')[0]}`); await page.screenshot({ path: `${DIR}/fail-${id}.png` }).catch(() => {}) }
  const cutTotal = cuts.reduce((s, [a, b]) => s + (b - a), 0)
  const shown = now() - start - cutTotal
  if (shown < need) await sleep((need - shown) * 1000)
  timeline.push({ id, start, end: now(), cuts, ok })
}

let me = null
const fund = async () => {
  me = await page.evaluate(() => JSON.parse(localStorage.getItem('inwif:v1')).wallets[0].accounts[0].address)
  await retry(() => pub.request({ method: 'anvil_setBalance', params: [me, toHex(parseEther('0.3'))] }))
  await retry(() => as(WHALE, WIF, transfer(me, parseEther('2500000'))))
  await retry(() => l1.request({ method: 'anvil_setBalance', params: [me, toHex(parseEther('0.05'))] }))
  console.log('  funded', me)
}

try {
  await sleep(1200)
  await scene('landing', null, async () => {
    await park()
    await sleep(1200)
    await scroll(2600, 9000)
  })

  await scene('site', async () => {
    await page.goto(`${BASE}/security`)
    await sleep(800)
  }, async () => {
    await scroll(900, 2500)
    await page.goto(`${BASE}/docs#faq`)
    await sleep(1000)
    await scroll(700, 2500)
  })

  await scene('create', async () => {
    await page.goto(`${BASE}/app`)
    await page.getByRole('button', { name: 'Create wallet' }).waitFor()
    await sleep(600)
  }, async () => {
    await click(page.getByRole('button', { name: 'Create wallet' }))
    await type(page.getByLabel('Password', { exact: true }), PW, 45)
    await type(page.getByLabel('Confirm password'), PW, 45)
    await click(page.getByRole('button', { name: 'Create wallet' }))
    await page.getByText('Pick your username').waitFor()
  })

  await scene('username', null, async () => {
    await type(page.getByLabel('Username', { exact: true }), NAME, 90)
    await page.getByText(`@${NAME} is available`).waitFor({ timeout: 20000 })
    await hover(page.getByTestId('signin-optin'), 1400)
    await click(page.getByRole('button', { name: `Claim @${NAME}` }))
    await page.getByTestId('signin-note').waitFor({ timeout: 60000 })
    await fund()
    await park()
  })

  await scene('backup', null, async () => {
    await click(page.getByRole('button', { name: 'Back up now' }))
    await type(page.getByLabel('Wallet password'), PW, 25)
    await click(page.getByRole('dialog').getByRole('button', { name: 'Continue' }))
    await click(page.getByRole('button', { name: /Reveal/ }))
    await sleep(2200)
    const words = await page.getByRole('dialog').locator('ol li span.font-medium').allTextContents()
    await click(page.getByRole('button', { name: 'I wrote it down' }))
    for (const label of await page.getByRole('dialog').locator('label[for^="bw"]').allTextContents()) {
      const n = Number(label.replace(/\D/g, ''))
      await type(page.getByLabel(label, { exact: true }), words[n - 1], 30)
    }
    await click(page.getByRole('dialog').getByRole('button', { name: 'Verify' }))
    await page.getByText('Backup verified').waitFor()
    await sleep(1200)
    await click(page.getByRole('dialog').getByRole('button', { name: 'Done' }))
  })

  await scene('dashboard', async () => {
    await page.getByRole('link', { name: 'Open my wallet' }).click()
    await page.getByText(/2\.5\dM|2,5\d\d,\d\d\d/).first().waitFor({ timeout: 90000 }).catch(() => {})
    await sleep(2500)
  }, async () => {
    await park()
    await sleep(1200)
    await hover(page.locator('main svg').first(), 1500)
    await hover(page.getByTestId('l1-banner'), 1200)
    await click(page.getByRole('button', { name: 'Hide balances' }))
    await sleep(1400)
    await click(page.getByRole('button', { name: 'Show balances' }))
    await scroll(500, 1500)
  })

  await scene('search', async () => { await scroll(-800, 300) }, async () => {
    await park()
    await page.keyboard.press('Control+k')
    await sleep(700)
    await page.keyboard.type('swap', { delay: 160 })
    await sleep(1400)
    await page.keyboard.press('Enter')
    await sleep(500)
  })

  await scene('swap', async () => {
    if (!page.url().includes('/app/swap')) await page.goto(`${BASE}/app/swap`)
    await page.getByLabel('Amount to swap').waitFor()
    await sleep(1500)
  }, async () => {
    await click(page.getByRole('button', { name: '25%' }))
    await sleep(900)
    await click(page.getByRole('button', { name: '50%' }))
    await sleep(700)
    await page.getByLabel('Amount to swap').fill('')
    await type(page.getByLabel('Amount to swap'), '0.02', 140)
    await cut(() => page.getByText('Minimum received').waitFor({ timeout: 60000 }))
    await sleep(800)
    await hover(page.getByText('Trading fee', { exact: true }), 1200)
    await hover(page.getByText(/% (below|above)$/), 1400)
    await hover(page.getByText('Minimum received'), 900)
  })

  await scene('swapsign', null, async () => {
    await click(page.getByRole('button', { name: 'Review swap' }))
    const d = page.getByRole('dialog')
    await cut(() => d.getByText(/Would succeed at the current block/).waitFor({ timeout: 60000 }))
    await hover(d.getByText(/Would succeed at the current block/), 1300)
    const pw = d.getByLabel('Wallet password')
    if (await pw.count()) await type(pw, PW, 25)
    const box = d.getByRole('checkbox')
    if (await box.count()) await click(box.first())
    await click(d.getByRole('button', { name: 'Sign & send' }))
    await cut(() => page.getByText('Confirmed on-chain').waitFor({ timeout: 60000 }))
    await sleep(1500)
    await click(d.getByRole('button', { name: 'Close' }).last())
  })

  await scene('receive', async () => {
    await page.goto(`${BASE}/app/receive`)
    await sleep(2000)
  }, async () => {
    await hover(page.locator('main canvas, main svg').first(), 1400)
    await hover(page.getByText(/@wifholder/).first(), 1200)
    await park()
  })

  await scene('request', null, async () => {
    await type(page.getByLabel('Amount (optional)'), '5000', 120)
    await type(page.getByLabel('Note (optional)'), 'Pizza night', 70)
    await sleep(800)
    await scroll(400, 1200)
    await hover(page.getByRole('button', { name: /Copy link/ }), 1200)
  })

  await scene('paypage', async () => {
    await page.goto(`${BASE}/@${NAME}`)
    await page.getByTestId('pay-profile').waitFor({ timeout: 20000 })
    await sleep(800)
  }, async () => {
    await hover(page.getByTestId('pay-profile'), 1200)
    await hover(page.getByRole('link', { name: `Pay @${NAME} in $WIF` }), 1500)
    await scroll(400, 1500)
  })

  await scene('send', async () => {
    await page.goto(`${BASE}/app/send`)
    await page.getByRole('button', { name: 'Asset' }).waitFor()
    await sleep(1500)
  }, async () => {
    await click(page.getByRole('button', { name: 'Asset' }))
    await click(page.getByRole('option', { name: /^WIF/ }).first().locator('button'))
    await type(page.getByLabel('Recipient address'), '@sarah', 130)
    await page.getByTestId('resolved-username').waitFor({ timeout: 20000 })
    await hover(page.getByTestId('resolved-username'), 1500)
    await hover(page.getByText('First payment to @sarah'), 1200)
    await type(page.getByLabel('Amount'), '10000', 130)
  })

  await scene('sendsign', null, async () => {
    await click(page.getByRole('button', { name: 'Review transaction' }))
    const d = page.getByRole('dialog')
    await cut(() => d.getByText(/Would succeed at the current block/).waitFor({ timeout: 60000 }))
    await hover(d.getByText('to @sarah').first(), 1000)
    const pw = d.getByLabel('Wallet password')
    if (await pw.count()) await type(pw, PW, 25)
    const box = d.getByRole('checkbox')
    if (await box.count()) await click(box.first())
    await click(d.getByRole('button', { name: 'Sign & send' }))
    await cut(() => page.getByText('Confirmed on-chain').waitFor({ timeout: 60000 }))
    await sleep(1400)
    await click(d.getByRole('button', { name: 'Close' }).last())
  })

  // Off camera: Sarah pays back, and a scammer plants a $0 transfer and dust from a look-alike of Sarah.
  await as(sarah.address, WIF, transfer(me, parseEther('20000')))
  await as(WHALE, WIF, encodeFunctionData({ abi: erc20Abi, functionName: 'transferFrom', args: [me, fake, 0n] }))
  await as(WHALE, WIF, transfer(fake, parseEther('1')))
  await as(fake, WIF, transfer(me, 1n))

  await scene('activity', async () => {
    await page.goto(`${BASE}/app/activity`)
    await page.getByText('from @sarah').first().waitFor({ timeout: 180000 })
    await sleep(1000)
  }, async () => {
    await hover(page.getByText('from @sarah').first(), 1400)
    await hover(page.getByText(/to @sarah/).first(), 1400)
    await scroll(300, 1200)
  })

  await scene('scam', null, async () => {
    await click(page.getByTestId('scam-hidden'))
    await page.getByText('Possible scam').first().waitFor()
    await hover(page.getByText('Possible scam').first(), 1800)
    await page.goto(`${BASE}/app/send`)
    await page.getByRole('button', { name: 'Asset' }).waitFor()
    await sleep(600)
    await click(page.getByRole('button', { name: 'Asset' }))
    await click(page.getByRole('option', { name: /^WIF/ }).first().locator('button'))
    await click(page.getByLabel('Recipient address'))
    await page.getByLabel('Recipient address').fill(fake)
    await page.getByText(/Scam warning: this address looks like/).waitFor({ timeout: 30000 })
    await hover(page.getByText(/Scam warning: this address looks like/), 2200)
    await click(page.getByRole('button', { name: /instead \(the one you paid\)/ }))
    await hover(page.getByText('You have paid this address before.'), 1500)
  })

  await scene('wif', async () => {
    await page.goto(`${BASE}/app/wif`)
    await sleep(3500)
  }, async () => {
    await park()
    await scroll(2400, 9000)
  })

  await scene('live', async () => {
    await page.goto(`${BASE}/app/wif/live`)
    await page.getByText('Trade feed').waitFor()
    await sleep(3500)
  }, async () => {
    await hover(page.getByText('Trade feed'), 1500)
    await scroll(500, 2500)
  })

  await scene('journey', async () => {
    await page.goto(`${BASE}/app/wif/journey`)
    await page.getByTestId('journey-hero').waitFor({ timeout: 180000 })
    await sleep(1500)
  }, async () => {
    await hover(page.getByTestId('journey-hero'), 1500)
    await scroll(1400, 6000)
  })

  await scene('card', async () => {
    await page.goto(`${BASE}/app/wif/card`)
    await page.getByRole('button', { name: 'Download' }).waitFor()
    await sleep(2500)
  }, async () => {
    await hover(page.locator('main canvas, main img').first(), 1500)
    await hover(page.getByRole('button', { name: 'Download' }), 1200)
    await hover(page.getByRole('link', { name: 'Post on X' }), 1200)
  })

  await scene('check', async () => {
    await page.goto(`${BASE}/app/check`)
    await page.getByLabel('Token address').waitFor()
    await sleep(800)
  }, async () => {
    await type(page.getByLabel('Token address'), WIF, 14)
    await click(page.getByRole('button', { name: /Check token/ }))
    await cut(() => page.getByText(/Low risk|Be careful|High risk/).first().waitFor({ timeout: 90000 }))
    await sleep(800)
    await hover(page.getByText(/Low risk|Be careful|High risk/).first(), 1400)
    await scroll(700, 3000)
  })

  await scene('defi', async () => {
    await page.goto(`${BASE}/app/defi`)
    await sleep(2500)
  }, async () => {
    await park()
    await scroll(400, 2000)
  })

  await scene('bridge', async () => {
    await page.goto(`${BASE}/app/bridge`)
    await page.getByText('Official Robinhood Chain bridge, checked on Ethereum').waitFor({ timeout: 60000 })
    await sleep(1200)
  }, async () => {
    await hover(page.getByTestId('l1-balance'), 1200)
    await click(page.getByRole('button', { name: '50%' }))
    await sleep(1200)
    await hover(page.getByText('Official Robinhood Chain bridge, checked on Ethereum'), 1500)
    await click(page.getByRole('button', { name: 'Review move' }))
    await page.getByRole('dialog').getByText('Robinhood Chain official bridge').waitFor()
    await sleep(2500)
    await page.keyboard.press('Escape')
  })

  await scene('security', async () => {
    await page.goto(`${BASE}/app/security`)
    await sleep(3000)
  }, async () => {
    await park()
    await scroll(1600, 7000)
  })

  await scene('hardware', async () => {
    await page.goto(`${BASE}/app/hardware`)
    await sleep(1500)
  }, async () => {
    await park()
    await scroll(900, 5000)
  })

  await scene('wallets', async () => {
    await page.goto(`${BASE}/app/wallets`)
    await sleep(1500)
  }, async () => {
    await park()
    await scroll(700, 4000)
  })

  await scene('rename', async () => {
    await page.goto(`${BASE}/app/settings`)
    await page.getByTestId('my-username').waitFor({ timeout: 20000 })
    await sleep(800)
  }, async () => {
    await click(page.getByRole('button', { name: 'Change username' }))
    const card = page.locator('#username')
    if (await card.getByLabel('Wallet password').count()) {
      await type(card.getByLabel('Wallet password'), PW, 25)
      await click(card.getByRole('button', { name: 'Unlock' }))
    }
    await type(page.getByLabel('Username', { exact: true }), NEW_NAME, 110)
    await page.getByText(`@${NEW_NAME} is available`).waitFor({ timeout: 20000 })
    await click(page.getByRole('button', { name: `Claim @${NEW_NAME}` }))
    await page.getByTestId('username-changed').waitFor({ timeout: 20000 })
    await hover(page.getByTestId('username-changed'), 1800)
  })

  await scene('reveal', null, async () => {
    await click(page.getByRole('button', { name: 'Show recovery phrase' }))
    const d = page.getByRole('dialog')
    await click(d.getByRole('checkbox'))
    await type(d.getByLabel(/Wallet password/), PW, 25)
    await click(d.getByRole('button', { name: 'Continue' }))
    await hover(d.getByTestId('secret-value'), 1000)
    await click(d.getByRole('button', { name: 'Tap to reveal' }))
    await sleep(2200)
    await click(d.getByRole('tab', { name: 'Private key' }))
    await click(d.getByRole('button', { name: 'Tap to reveal' }))
    await sleep(1800)
    await click(d.getByRole('button', { name: 'Done' }))
  })

  await scene('settings', null, async () => {
    await park()
    await scroll(2600, 9000)
  })

  await scene('signin', async () => {
    // A new device: nothing of the wallet stored in this browser.
    await page.goto(`${BASE}/app`)
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await page.goto(`${BASE}/app`)
    await page.getByRole('button', { name: /Sign in with @username/ }).waitFor()
    await sleep(1000)
  }, async () => {
    await click(page.getByRole('button', { name: /Sign in with @username/ }))
    await type(page.getByLabel('Username', { exact: true }), NEW_NAME, 110)
    await type(page.getByLabel('Password', { exact: true }), PW, 45)
    await click(page.getByRole('button', { name: /^Sign in$/ }))
    await cut(() => page.getByText(`Welcome back, @${NEW_NAME}`).waitFor({ timeout: 60000 }))
    await sleep(1500)
    await click(page.getByRole('link', { name: 'Open my wallet' }))
    await page.getByText(/WIF/).first().waitFor()
    await sleep(2500)
  })

  await scene('outro', async () => {
    await page.setContent(`<!doctype html><html><head><style>
      body{margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 80% 10%,#FCEEE5,transparent),radial-gradient(900px 500px at 10% 0%,#EFE6F7,transparent),#F6F2F0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#111}
      .w{text-align:center} img{width:150px;height:150px;border-radius:36px;box-shadow:0 20px 60px rgba(232,98,44,.25)}
      h1{font-size:84px;margin:28px 0 6px;letter-spacing:-2px} h1 b{color:#E8622C}
      p{font-size:30px;color:#5F5B57;margin:8px 0} .u{margin-top:34px;display:inline-block;background:#E8622C;color:#fff;font-size:34px;font-weight:700;padding:16px 40px;border-radius:999px}
    </style></head><body><div class="w"><img src="${BASE}/brand/emblem.png"><h1>In<b>WIF</b></h1><p>Free for everyone, forever.</p><p>Your keys. Your $WIF.</p><div class="u">inwif.xyz</div></div></body></html>`)
    await sleep(1200)
  }, async () => {
    await page.mouse.move(-10, -10)
    await sleep(2000)
  })
} finally {
  writeFileSync(`${DIR}/timeline.json`, JSON.stringify({ timeline, sarah: sarah.address, fake, me }, null, 1))
  await sleep(500)
  ff.stdin.write('q')
  await new Promise((r) => ff.on('exit', r))
  await browser.close()
  console.log('recording done', now().toFixed(1), 's')
}
