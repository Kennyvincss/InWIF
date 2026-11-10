/**
 * Sign in with @username + password, change username, and view the recovery phrase / key.
 * Three separate browser contexts stand in for three devices.
 *
 *   pnpm build && pnpm start &   (no Upstash locally: sign-in and usernames use memory)
 *   NODE_USE_ENV_PROXY=1 node e2e/signin.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const PW = 'correct horse battery 42'
const tag = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'zz'
const NAME = `kenny_${tag}`
const NEW_NAME = `kennyv_${tag}`
const assert = (c, m) => {
  if (!c) throw new Error(`ASSERT: ${m}`)
  console.log(`  ✓ ${m}`)
}

const browser = await chromium.launch()
const errors = []
const pages = []
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && console.log(`    [${r.status()}] ${r.url().replace(BASE, '')}`))
  pages.push(page)
  return page
}
async function reveal(page, tab) {
  await page.goto(`${BASE}/app/settings`)
  await page.getByRole('button', { name: tab === 'phrase' ? 'Show recovery phrase' : 'Show private key' }).click()
  const d = page.getByRole('dialog')
  await d.getByRole('checkbox').check()
  await d.getByLabel(/Wallet password/).fill(PW)
  await d.getByRole('button', { name: 'Continue' }).click()
  await d.getByRole('button', { name: 'Tap to reveal' }).click()
  const text = (await d.getByTestId('secret-value').innerText()).trim()
  return { d, text }
}
async function signInAs(page, username, password) {
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Sign in with @username/ }).click()
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: /^Sign in$/ }).click()
}

try {
  console.log('Device 1: create a wallet, claim a username, sign-in turns on')
  const a = await device()
  await a.goto(`${BASE}/app`)
  await a.getByRole('button', { name: 'Create wallet' }).click()
  await a.getByLabel('Password', { exact: true }).fill('short pw 1')
  await a.getByLabel('Confirm password').fill('short pw 1')
  await a.getByRole('button', { name: 'Create wallet' }).click()
  await a.getByText('Use at least 12 characters.').first().waitFor()
  assert(true, 'passwords need at least 12 characters')
  await a.getByLabel('Password', { exact: true }).fill(PW)
  await a.getByLabel('Confirm password').fill(PW)
  await a.getByRole('button', { name: 'Create wallet' }).click()
  await a.getByText('Pick your username').waitFor()
  assert(await a.getByTestId('signin-optin').isChecked(), '"sign in on other devices" is offered and ticked by default')
  await a.getByLabel('Username', { exact: true }).fill(NAME)
  await a.getByText(`@${NAME} is available`).waitFor({ timeout: 15000 })
  await a.screenshot({ path: `${OUT}/signin-optin.png` })
  await a.getByRole('button', { name: `Claim @${NAME}` }).click()
  await a.getByTestId('signin-note').waitFor({ timeout: 30000 })
  assert(((await a.getByTestId('signin-note').textContent()) ?? '').includes(`sign in on any device with @${NAME}`), `sign-in is on for @${NAME}`)
  await a.getByRole('link', { name: 'Open my wallet' }).click()
  const address = await a.evaluate(() => JSON.parse(localStorage.getItem('inwif:v1')).wallets[0].accounts[0].address)

  console.log('Device 1: view recovery phrase and private key')
  const phrase = await reveal(a, 'phrase')
  const words = phrase.text.split(/\s+/).filter((w) => /^[a-z]+$/.test(w))
  assert(words.length === 12, 'recovery phrase shown: 12 words (password + "nobody can see" check first)')
  await a.screenshot({ path: `${OUT}/reveal-phrase.png` })
  await phrase.d.getByRole('tab', { name: 'Private key' }).click()
  await phrase.d.getByRole('button', { name: 'Tap to reveal' }).click()
  const key = (await phrase.d.getByTestId('secret-value').innerText()).trim()
  assert(/^0x[0-9a-f]{64}$/.test(key), 'private key shown for the account')
  await phrase.d.getByRole('button', { name: 'Done' }).click()

  console.log('Device 1: change username')
  await a.goto(`${BASE}/app/settings`)
  await a.getByRole('button', { name: 'Change username' }).click()
  await a.locator('#username').getByLabel('Wallet password').fill(PW)
  await a.locator('#username').getByRole('button', { name: 'Unlock' }).click()
  assert(true, 'a locked wallet unlocks right in the username card')
  await a.getByLabel('Username', { exact: true }).fill(NEW_NAME)
  await a.getByText(`@${NEW_NAME} is available`).waitFor({ timeout: 15000 })
  await a.getByRole('button', { name: `Claim @${NEW_NAME}` }).click()
  await a.getByTestId('username-changed').waitFor({ timeout: 15000 })
  assert((await a.getByTestId('my-username').textContent()) === `@${NEW_NAME}`, `username changed to @${NEW_NAME}; @${NAME} still points to the same wallet`)
  await a.screenshot({ path: `${OUT}/username-change.png` })

  console.log('Device 2: sign in')
  const b = await device()
  const bodies = []
  b.on('request', (r) => r.postData() && bodies.push(r.postData()))
  await signInAs(b, NAME, 'wrong password 123')
  await b.getByText(/Wrong password\. 9 tries left/).waitFor({ timeout: 30000 })
  assert(true, 'wrong password refused (9 tries left)')
  await b.screenshot({ path: `${OUT}/signin-wrong.png` })
  await b.getByLabel('Password', { exact: true }).fill(PW)
  await b.getByRole('button', { name: /^Sign in$/ }).click()
  await b.getByText(`Welcome back, @${NEW_NAME}`).waitFor({ timeout: 30000 })
  assert(true, `signed in with the OLD name @${NAME}: "Welcome back, @${NEW_NAME}"`)
  assert(!bodies.some((x) => x.includes(PW) || x.includes(words.join(' '))), 'neither the password nor the recovery phrase was ever sent to the server')
  await b.getByRole('link', { name: 'Open my wallet' }).click()
  const addressB = await b.evaluate(() => JSON.parse(localStorage.getItem('inwif:v1')).wallets[0].accounts[0].address)
  assert(addressB === address, 'the same wallet (same address) opened on device 2')
  const phraseB = await reveal(b, 'phrase')
  assert(phraseB.text.split(/\s+/).filter((w) => /^[a-z]+$/.test(w)).join(' ') === words.join(' '), 'same recovery phrase on device 2')
  await phraseB.d.getByRole('button', { name: 'Done' }).click()

  console.log('Device 3: sign in with the new name')
  const c = await device()
  await signInAs(c, NEW_NAME, PW)
  await c.getByText(`Welcome back, @${NEW_NAME}`).waitFor({ timeout: 30000 })
  assert(true, `signed in with the new name @${NEW_NAME}`)

  console.log('Lockout')
  const statuses = await c.evaluate(async (n) => {
    const out = []
    for (let i = 0; i < 10; i++) {
      const r = await fetch('/api/signin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: n, signinKey: '0'.repeat(63) + (i % 10) }) })
      out.push(r.status)
      await new Promise((res) => setTimeout(res, 6500)) // stay under the per-IP limit (10/min)
    }
    return out
  }, NEW_NAME)
  assert(statuses.slice(0, 9).every((s) => s === 401) && statuses[9] === 429, `10 wrong attempts lock sign-in for the account (${statuses.join(',')})`)

  console.log('Device 1: turn sign-in off')
  await a.goto(`${BASE}/app/settings`)
  await a.getByTestId('signin-on').waitFor({ timeout: 15000 })
  await a.screenshot({ path: `${OUT}/signin-settings.png` })
  await a.getByTestId('signin-on').locator('..').getByLabel('Wallet password').fill(PW)
  await a.getByRole('button', { name: /Turn off and delete the online copy/ }).click()
  await a.getByRole('button', { name: /Turn on sign-in/ }).waitFor({ timeout: 15000 })
  const d = await device()
  await signInAs(d, NEW_NAME, PW)
  await d.getByText(/No InWIF account signs in with that username/).waitFor({ timeout: 30000 })
  assert(true, 'after turning it off, nobody can sign in with that username')

  assert(!errors.length, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  console.log('\nSign-in E2E passed')
} catch (e) {
  console.error('FAILED:', String(e.message).split('\n')[0])
  for (const [i, p] of pages.entries()) await p.screenshot({ path: `${OUT}/signin-fail-${i}.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
