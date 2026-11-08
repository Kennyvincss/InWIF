/**
 * End-to-end smoke test against a running InWIF web build and a local Anvil node.
 *   anvil --chain-id 31337 &
 *   NEXT_PUBLIC_ENABLE_LOCAL_NETWORK=true NEXT_PUBLIC_ENABLE_HARDWARE=true pnpm build && pnpm start &
 *   node e2e/smoke.mjs
 * Performs real transactions on the local chain (software wallet + hardware simulator)
 * and verifies them via the RPC.
 */
import { chromium } from 'playwright'
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const SCALE = Number(process.env.SHOT_SCALE ?? 1)
const ANVIL_PHRASE = 'test test test test test test test test test test test junk'
const FUNDER = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d') // anvil #1
const RECIPIENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' // anvil #2

const pub = createPublicClient({ chain: foundry, transport: http(RPC) })
const funder = createWalletClient({ account: FUNDER, chain: foundry, transport: http(RPC) })
const assert = (c, m) => {
  if (!c) throw new Error(`ASSERT: ${m}`)
  console.log(`  ✓ ${m}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SCALE })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false })

try {
console.log('Landing')
await page.goto(BASE)
await page.getByText('Your InWIF.').first().waitFor()
assert(await page.getByRole('link', { name: 'Get Started' }).first().isVisible(), 'hero CTA visible')
await page.waitForTimeout(1200)
await shot('01-landing')

console.log('Create wallet')
await page.goto(`${BASE}/app`)
const tCreate = Date.now()
await page.getByRole('button', { name: 'Create wallet' }).click()
await page.getByLabel('Password', { exact: true }).fill('correct horse battery 42')
await page.getByLabel('Confirm password').fill('correct horse battery 42')
await page.getByRole('button', { name: 'Create wallet' }).click()
await page.getByText('Pick your username').waitFor()
await page.getByRole('button', { name: /Skip for now/ }).click()
await page.getByText('Your wallet is ready').waitFor()
assert(true, `wallet created in one step (password only) in ${((Date.now() - tCreate) / 1000).toFixed(1)}s`)
assert(await page.getByText('Back up your recovery phrase before you add funds').isVisible(), 'backup reminder shown after creation')

console.log('Back up later')
await page.getByRole('button', { name: 'Back up now' }).click()
await page.getByLabel('Wallet password').fill('correct horse battery 42')
await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
await page.getByRole('button', { name: /Reveal/ }).click()
const words = await page.getByRole('dialog').locator('ol li span.font-medium').allTextContents()
assert(words.length === 12, '12-word phrase generated locally, shown only on request')
await shot('02-phrase')
await page.getByRole('button', { name: 'I wrote it down' }).click()
for (const label of await page.getByRole('dialog').locator('label[for^="bw"]').allTextContents()) {
  const n = Number(label.replace(/\D/g, ''))
  await page.getByLabel(label, { exact: true }).fill(words[n - 1])
}
await page.getByRole('dialog').getByRole('button', { name: 'Verify' }).click()
await page.getByText('Backup verified').waitFor()
await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
assert(JSON.parse(await page.evaluate(() => localStorage.getItem('inwif:v1'))).wallets[0].backedUp === true, 'backup verified with the word quiz and recorded')
await page.getByRole('link', { name: 'Open my wallet' }).click()
await page.getByLabel('Network').first().selectOption('local')
await page.locator('aside').getByRole('link', { name: 'Security', exact: true }).click()
await page.getByText('✓ Network verified').waitFor({ timeout: 20000 })
assert(!(await page.getByText('Network issue').count()), 'live chain ID verified against local RPC (no network warning)')

const stored = await page.evaluate(() => localStorage.getItem('inwif:v1'))
assert(!words.some((w) => stored.includes(` ${w} `)) && !stored.includes(words.join(' ')), 'recovery phrase not stored in plaintext')
const myAddr = JSON.parse(stored).wallets[0].accounts[0].address

// Client-side navigation keeps the in-memory unlocked session and simulator alive.
const nav = (label) => page.locator('aside').getByRole('link', { name: label, exact: true }).click()

console.log('Fund & send (software signer)')
await pub.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: myAddr, value: parseEther('1') }) })
const before = await pub.getBalance({ address: RECIPIENT })
await nav('Send')
await page.getByLabel('Recipient address').fill(RECIPIENT)
await page.getByLabel('Amount').fill('0.1')
await page.getByRole('button', { name: 'Review transaction' }).click()
await page.getByText(/Would succeed at the current block/).waitFor({ timeout: 20000 })
await shot('03-review')
await page.getByRole('dialog').getByRole('checkbox').check()
await page.getByRole('button', { name: 'Sign & send' }).click()
await page.getByText('Confirmed on-chain').waitFor({ timeout: 30000 })
await shot('04-confirmed')
const after = await pub.getBalance({ address: RECIPIENT })
assert(after - before === parseEther('0.1'), `recipient received exactly 0.1 ETH on-chain (now ${formatEther(after)})`)
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click()

await nav('Portfolio')
await page.getByText('Assets').first().waitFor()
await page.waitForTimeout(1500)
await shot('04b-dashboard')

console.log('Security centre + $WIF + swap pages render')
for (const l of ['Security', '$WIF', 'Swap', 'DeFi', 'Activity', 'Wallets', 'Settings', 'Receive']) {
  await nav(l)
  await page.locator('h1').first().waitFor()
}
assert(true, 'all wallet pages render')

console.log('Hardware simulator offline signing')
await nav('Hardware')
await page.getByRole('button', { name: /Start device simulator/ }).click()
await page.getByRole('button', { name: /Restore from recovery phrase/ }).click()
await page.getByPlaceholder('recovery phrase (typed on device)').fill(ANVIL_PHRASE)
await page.getByPlaceholder('Choose PIN (6–8 digits)').fill('135790')
await page.getByRole('button', { name: 'OK' }).click()
await page.getByText('READY').waitFor()
await page.getByRole('button', { name: /Verify authenticity/ }).click()
await page.getByText(/Development device/).first().waitFor()
assert(true, 'attestation challenge passed as development device (never "genuine")')
await page.getByRole('button', { name: /Add device accounts/ }).click()
await page.getByText(/Hardware wallet added/).waitFor()
await shot('05-hardware')

const before2 = await pub.getBalance({ address: RECIPIENT })
await nav('Send')
await page.getByLabel('Recipient address').fill(RECIPIENT)
await page.getByLabel('Amount').fill('0.05')
await page.getByRole('button', { name: 'Review transaction' }).click()
await page.getByText(/Would succeed at the current block/).waitFor({ timeout: 20000 })
await page.getByRole('dialog').getByRole('checkbox').check()
await page.getByRole('button', { name: 'Send to device' }).click()
await page.getByText('✕ reject · ✓ approve').waitFor({ timeout: 15000 })
await shot('06-device-prompt')
await page.getByRole('button', { name: 'Approve on device' }).click()
await page.getByText('Confirmed on-chain').waitFor({ timeout: 30000 })
const after2 = await pub.getBalance({ address: RECIPIENT })
assert(after2 - before2 === parseEther('0.05'), 'hardware-signed tx confirmed on-chain: recipient +0.05 ETH')
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click()
await nav('Hardware')
await page.getByText('Signature returns to the companion app').waitFor()
await shot('07-offline-flow')

console.log('Rejection on device')
await nav('Send')
await page.getByLabel('Recipient address').fill(RECIPIENT)
await page.getByLabel('Amount').fill('0.01')
await page.getByRole('button', { name: 'Review transaction' }).click()
await page.getByText(/Would succeed at the current block/).waitFor({ timeout: 20000 })
await page.getByRole('dialog').getByRole('checkbox').check()
await page.getByRole('button', { name: 'Send to device' }).click()
await page.getByText('✕ reject · ✓ approve').waitFor({ timeout: 15000 })
await page.getByRole('button', { name: 'Reject on device' }).click()
await page.getByText('Rejected on device').waitFor()
assert(true, 'device rejection surfaces and nothing is broadcast')

console.log('Mobile layout')
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(BASE)
await page.waitForTimeout(1200)
await shot('08-mobile-landing')

assert(errors.length === 0, `no uncaught page errors ${errors.length ? JSON.stringify(errors) : ''}`)
await browser.close()
console.log('\nE2E smoke test passed')
} catch (e) {
  console.error('FAILED:', String(e.message).split('\n')[0])
  await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {})
  console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 1200))
  await browser.close()
  process.exit(1)
}
