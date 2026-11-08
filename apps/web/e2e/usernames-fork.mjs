/**
 * Usernames E2E on a fork of Robinhood Chain mainnet: two people sign up, each claims a
 * username, and one sends real $WIF to the other by typing @username.
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545 &
 *   NEXT_PUBLIC_ROBINHOOD_RPC_URL=http://127.0.0.1:8545 pnpm build && pnpm start &
 *   NODE_USE_ENV_PROXY=1 node e2e/usernames-fork.mjs
 *
 * Without Upstash the local server keeps usernames in memory (same rules as production).
 */
import { chromium } from 'playwright'
import { createPublicClient, defineChain, encodeFunctionData, erc20Abi, formatEther, getAddress, http, parseEther, toHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const RPC = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8545'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const WIF = '0x5173b8eA6923c2d40267890D45C46a3480954773'
const WHALE = '0x156064f872eb6dedc953e7af21e7a7991910ef09'
const PW = 'correct horse battery 42'
const chain = defineChain({ id: 4663, name: 'Robinhood Chain (fork)', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const pub = createPublicClient({ chain, transport: http(RPC) })
const assert = (c, m) => {
  if (!c) throw new Error(`ASSERT: ${m}`)
  console.log(`  ✓ ${m}`)
}
const wifOf = (a) => pub.readContract({ address: WIF, abi: erc20Abi, functionName: 'balanceOf', args: [a] })

const tag = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'zz'
const NAME_A = `alice_${tag}`
const NAME_B = `bob_${tag}`
const keyA = generatePrivateKey()
const keyB = generatePrivateKey()
const A = privateKeyToAccount(keyA)
const B = privateKeyToAccount(keyB)

// Fund B with ETH for gas and 10,000 real $WIF from a mainnet holder (fork only).
await pub.request({ method: 'anvil_setBalance', params: [B.address, toHex(parseEther('1'))] })
await pub.request({ method: 'anvil_setBalance', params: [WHALE, toHex(parseEther('1'))] })
await pub.request({ method: 'anvil_impersonateAccount', params: [WHALE] })
const fundTx = await pub.request({
  method: 'eth_sendTransaction',
  params: [{ from: WHALE, to: WIF, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B.address, parseEther('10000')] }) }],
})
await pub.waitForTransactionReceipt({ hash: fundTx })
await pub.request({ method: 'anvil_stopImpersonatingAccount', params: [WHALE] })

const browser = await chromium.launch()
const errors = []
async function person() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  return page
}
async function importKey(page, pk) {
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Import an existing wallet/ }).click()
  await page.getByRole('button', { name: 'Private key' }).click()
  await page.getByLabel('Private key').fill(pk)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByLabel('Confirm password').fill(PW)
  await page.getByRole('button', { name: 'Encrypt & finish' }).click()
  await page.getByText('Pick your username').waitFor()
}
async function claim(page, name, shot) {
  await page.getByLabel('Username').fill(name)
  await page.getByText(`@${name} is available`).waitFor({ timeout: 10000 })
  if (shot) await page.waitForTimeout(500).then(() => page.screenshot({ path: `${OUT}/${shot}.png` }))
  await page.getByRole('button', { name: `Claim @${name}` }).click()
}

let pageA, pageB
try {
  console.log('Person A signs up and claims a username')
  pageA = await person()
  await importKey(pageA, keyA)
  await pageA.getByLabel('Username').fill('ab')
  await pageA.getByText('At least 3 characters.').waitFor()
  await pageA.getByLabel('Username').fill('inwif_support')
  await pageA.getByText('This name is reserved.').waitFor()
  assert(true, 'too-short and official-looking names refused')
  await claim(pageA, NAME_A, 'username-pick')
  await pageA.getByText(`You're @${NAME_A}`).waitFor({ timeout: 15000 })
  assert(true, `A claimed @${NAME_A} at sign-up (signed message, no transaction)`)
  await pageA.waitForTimeout(600)
  await pageA.screenshot({ path: `${OUT}/username-claimed.png` })
  await pageA.getByRole('link', { name: 'Open my wallet' }).click()
  await pageA.locator('aside').getByText(`@${NAME_A}`).waitFor({ timeout: 15000 })
  assert(true, 'username shown on the account card')

  console.log('Person B signs up: taken and look-alike names are refused')
  pageB = await person()
  await importKey(pageB, keyB)
  await pageB.getByLabel('Username').fill(NAME_A)
  await pageB.getByText(`@${NAME_A} is taken`).waitFor({ timeout: 10000 })
  const lookalike = NAME_A.replace('alice', 'al1ce')
  await pageB.getByLabel('Username').fill(lookalike)
  await pageB.getByText('Too close to a username that is taken').waitFor({ timeout: 10000 })
  assert(true, `@${NAME_A} is taken and the look-alike @${lookalike} is blocked`)
  await claim(pageB, NAME_B)
  await pageB.getByText(`You're @${NAME_B}`).waitFor({ timeout: 15000 })
  await pageB.getByRole('link', { name: 'Open my wallet' }).click()
  assert(true, `B claimed @${NAME_B}`)

  console.log('B sends 1,234 $WIF to @A')
  await pageB.goto(`${BASE}/app/send`)
  await pageB.getByRole('button', { name: 'Asset' }).click()
  await pageB.getByRole('option', { name: /^WIF/ }).first().locator('button').click()
  await pageB.getByLabel('Recipient address').fill('@nobody_here_xyz')
  await pageB.getByText('No InWIF user is called @nobody_here_xyz').waitFor({ timeout: 10000 })
  assert(true, 'unknown usernames are refused')
  await pageB.getByLabel('Recipient address').fill(`@${NAME_A}`)
  const card = pageB.getByTestId('resolved-username')
  await card.waitFor({ timeout: 10000 })
  const shown = (await card.textContent()) ?? ''
  assert(shown.includes(getAddress(A.address)), `@${NAME_A} resolved and verified on-device to ${A.address}`)
  assert(await pageB.getByText(`First payment to @${NAME_A}`).count(), 'first payment to a username is flagged')
  await pageB.getByLabel('Amount').fill('1234')
  await pageB.screenshot({ path: `${OUT}/username-send.png` })
  await pageB.getByRole('button', { name: 'Review transaction' }).click()
  const dialog = pageB.getByRole('dialog')
  await dialog.getByText(`to @${NAME_A}`).first().waitFor({ timeout: 30000 })
  await dialog.getByText(/Would succeed at the current block/).waitFor({ timeout: 30000 })
  const pw = dialog.getByLabel('Wallet password')
  if (await pw.count()) await pw.fill(PW)
  const box = dialog.getByRole('checkbox')
  if (await box.count()) await box.first().check()
  await dialog.getByRole('button', { name: 'Sign & send' }).click()
  await pageB.getByText('Confirmed on-chain').waitFor({ timeout: 30000 })
  await dialog.getByRole('button', { name: 'Close' }).last().click()
  const got = await wifOf(A.address)
  assert(got === parseEther('1234'), `A received ${formatEther(got)} WIF on-chain`)

  console.log('Safety: a username whose address changed is blocked')
  const pins = await pageB.evaluate(() => JSON.parse(localStorage.getItem('inwif:v1')).namePins)
  assert(pins[NAME_A]?.toLowerCase() === A.address.toLowerCase(), 'B remembers who @A is after paying them')
  await pageB.evaluate(([n]) => {
    const s = JSON.parse(localStorage.getItem('inwif:v1'))
    s.namePins[n] = '0x000000000000000000000000000000000000dEaD'
    localStorage.setItem('inwif:v1', JSON.stringify(s))
  }, [NAME_A])
  await pageB.reload()
  await pageB.getByLabel('Recipient address').fill(`@${NAME_A}`)
  await pageB.getByText(/now points to a different address/).waitFor({ timeout: 10000 })
  await pageB.getByLabel('Amount').fill('1')
  assert(await pageB.getByRole('button', { name: 'Review transaction' }).isDisabled(), 'sending is blocked when a known username points somewhere new')

  console.log('Registry refuses forged and stolen claims')
  const post = (claim) => pageB.evaluate(async (c) => (await fetch('/api/names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim: c }) })).status, claim)
  const msg = (c) => ['InWIF username', '', `I am claiming @${c.username} for my address`, getAddress(c.address), '', `Issued: ${c.issuedAt}`, '', 'This signature is free. It does not send a transaction or give access to your funds.'].join('\n')
  const now = new Date().toISOString()
  const forged = { username: 'forged_name', address: A.address, issuedAt: now }
  assert((await post({ ...forged, signature: await B.signMessage({ message: msg(forged) }) })) === 400, 'a claim for someone else’s address is rejected')
  const steal = { username: NAME_A, address: B.address, issuedAt: now }
  assert((await post({ ...steal, signature: await B.signMessage({ message: msg(steal) }) })) === 409, 'a taken name cannot be claimed again')
  const old = { username: 'late_name', address: B.address, issuedAt: new Date(Date.now() - 3600_000).toISOString() }
  assert((await post({ ...old, signature: await B.signMessage({ message: msg(old) }) })) === 400, 'old signatures cannot be replayed')

  console.log('Usernames survive a reload')
  await pageA.goto(`${BASE}/app/settings`)
  await pageA.getByTestId('my-username').waitFor({ timeout: 15000 })
  assert((await pageA.getByTestId('my-username').textContent()) === `@${NAME_A}`, 'Settings shows the username')
  await pageA.screenshot({ path: `${OUT}/username-settings.png` })

  assert(!errors.length, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  console.log('\nUsernames E2E passed')
} catch (e) {
  await pageB?.screenshot({ path: `${OUT}/usernames-failure-b.png` }).catch(() => {})
  await pageA?.screenshot({ path: `${OUT}/usernames-failure-a.png` }).catch(() => {})
  console.error('FAILED:', String(e.message).split('\n')[0])
  process.exitCode = 1
} finally {
  await browser.close()
}
