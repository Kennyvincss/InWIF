/**
 * Scam shield E2E on a fork of Robinhood Chain mainnet. Recreates a real address-poisoning
 * attack against a user who paid a friend in $WIF, then checks InWIF hides the planted
 * entries and blocks paying the look-alike address.
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545 &
 *   NEXT_PUBLIC_ROBINHOOD_RPC_URL=http://127.0.0.1:8545 pnpm build && pnpm start &
 *   NODE_USE_ENV_PROXY=1 node e2e/scam-shield-fork.mjs
 */
import { chromium } from 'playwright'
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, erc20Abi, getAddress, http, parseEther, toHex } from 'viem'
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
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`

const key = generatePrivateKey()
const me = privateKeyToAccount(key)
const friend = privateKeyToAccount(generatePrivateKey()).address
// The attacker's look-alike: same first 5 and last 5 characters as the friend's address.
const middle = Array.from({ length: 30 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
const fake = getAddress(`0x${friend.slice(2, 7)}${middle}${friend.slice(-5)}`.toLowerCase())

async function as(from, to, data, value = 0n) {
  await pub.request({ method: 'anvil_impersonateAccount', params: [from] })
  const hash = await pub.request({ method: 'eth_sendTransaction', params: [{ from, to, data, value: toHex(value) }] })
  await pub.waitForTransactionReceipt({ hash })
  await pub.request({ method: 'anvil_stopImpersonatingAccount', params: [from] })
}
const transfer = (to, amount) => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] })

// Set-up: the user holds ETH and $WIF and has paid a friend 100 WIF (a real payment they signed).
for (const a of [me.address, WHALE, fake]) await pub.request({ method: 'anvil_setBalance', params: [a, toHex(parseEther('1'))] })
await as(WHALE, WIF, transfer(me.address, parseEther('10000')))
const wallet = createWalletClient({ account: me, chain, transport: http(RPC) })
await pub.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: WIF, data: transfer(friend, parseEther('100')) }) })
// The attack: a $0 "transfer from you" to the look-alike (anyone can do this), then dust from it.
await as(WHALE, WIF, encodeFunctionData({ abi: erc20Abi, functionName: 'transferFrom', args: [me.address, fake, 0n] }))
await as(WHALE, WIF, transfer(fake, parseEther('1')))
await as(fake, WIF, transfer(me.address, 1n))
console.log(`friend ${short(friend)} · look-alike ${short(fake)}`)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Import an existing wallet/ }).click()
  await page.getByRole('button', { name: 'Private key' }).click()
  await page.getByLabel('Private key').fill(key)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByLabel('Confirm password').fill(PW)
  await page.getByRole('button', { name: 'Encrypt & finish' }).click()
  await page.getByRole('button', { name: /Skip for now/ }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()

  console.log('Activity hides the planted entries')
  await page.goto(`${BASE}/app/activity`)
  const hidden = page.getByTestId('scam-hidden')
  await hidden.waitFor({ timeout: 120000 })
  assert(/2 suspicious transfers hidden/.test((await hidden.textContent()) ?? ''), 'the $0 transfer and the dust from the look-alike are hidden')
  const list = page.locator('main ul').first()
  assert(((await list.textContent()) ?? '').includes(friend), 'the real payment to the friend is still shown')
  assert(!((await list.textContent()) ?? '').includes(fake), 'the look-alike address is not shown by default')
  await page.screenshot({ path: `${OUT}/shield-activity.png` })
  await hidden.click()
  await page.getByText('Possible scam').first().waitFor()
  assert((await page.getByText('Possible scam').count()) === 2, 'when shown, both are marked "Possible scam" with the reason')
  await page.screenshot({ path: `${OUT}/shield-activity-shown.png` })

  console.log('Send blocks the look-alike')
  await page.goto(`${BASE}/app/send`)
  await page.getByRole('button', { name: 'Asset' }).filter({ hasText: 'WIF' }).waitFor({ timeout: 30000 })
  await page.getByLabel('Recipient address').fill(fake)
  await page.getByText(/Scam warning: this address looks like/).waitFor({ timeout: 30000 })
  await page.getByLabel('Amount').fill('50')
  assert(await page.getByRole('button', { name: 'Review transaction' }).isDisabled(), `paying ${short(fake)} is blocked: it imitates ${short(friend)}`)
  await page.screenshot({ path: `${OUT}/shield-send.png` })
  await page.getByRole('button', { name: /instead \(the one you paid\)/ }).click()
  assert((await page.getByLabel('Recipient address').inputValue()).toLowerCase() === friend.toLowerCase(), 'one tap switches to the real address')
  await page.getByText('✓ You have paid this address before.').waitFor()
  assert(await page.getByRole('button', { name: 'Review transaction' }).isEnabled(), 'the real address is marked as paid before and can be sent to')

  await page.getByLabel('Recipient address').fill(fake)
  await page.getByText(/Scam warning/).waitFor()
  await page.getByLabel(/I checked with the recipient/).check()
  assert(await page.getByRole('button', { name: 'Review transaction' }).isEnabled(), 'a user who has checked can still override on purpose')

  const stranger = privateKeyToAccount(generatePrivateKey()).address
  await page.getByLabel('Recipient address').fill(stranger)
  await page.getByText(/New address: you have not paid it before/).waitFor()
  assert(true, 'an unrelated new address is just marked as new')

  assert(!errors.length, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  console.log('\nScam shield E2E passed')
} catch (e) {
  await page.screenshot({ path: `${OUT}/shield-failure.png` }).catch(() => {})
  console.error('FAILED:', String(e.message).split('\n')[0])
  process.exitCode = 1
} finally {
  await browser.close()
}
