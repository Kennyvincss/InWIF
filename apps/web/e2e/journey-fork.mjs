/**
 * "My $WIF journey" E2E on a fork of Robinhood Chain mainnet: a user receives 10,000 real
 * $WIF, sends 2,500 to a friend and gets 1 wei of dust from a look-alike address. The page
 * must show 7,500 WIF held, one add and one sale, and ignore the dust.
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545 &
 *   NEXT_PUBLIC_ROBINHOOD_RPC_URL=http://127.0.0.1:8545 pnpm build && pnpm start &
 *   NODE_USE_ENV_PROXY=1 node e2e/journey-fork.mjs
 */
import { chromium } from 'playwright'
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, erc20Abi, getAddress, http, parseEther, toHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const RPC = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8545'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const WIF = '0x5173b8eA6923c2d40267890D45C46a3480954773'
const WHALE = '0x156064f872eb6dedc953e7af21e7a7991910ef09'
const chain = defineChain({ id: 4663, name: 'Robinhood Chain (fork)', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const pub = createPublicClient({ chain, transport: http(RPC) })
const assert = (c, m) => {
  if (!c) throw new Error(`ASSERT: ${m}`)
  console.log(`  ✓ ${m}`)
}
const transfer = (to, amount) => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] })
async function as(from, to, data) {
  await pub.request({ method: 'anvil_impersonateAccount', params: [from] })
  const hash = await pub.request({ method: 'eth_sendTransaction', params: [{ from, to, data }] })
  await pub.waitForTransactionReceipt({ hash })
  await pub.request({ method: 'anvil_stopImpersonatingAccount', params: [from] })
}

const key = generatePrivateKey()
const me = privateKeyToAccount(key)
const friend = privateKeyToAccount(generatePrivateKey()).address
const fake = getAddress(`0x${friend.slice(2, 7)}${'7'.repeat(30)}${friend.slice(-5)}`.toLowerCase())
for (const a of [me.address, WHALE, fake]) await pub.request({ method: 'anvil_setBalance', params: [a, toHex(parseEther('1'))] })
await as(WHALE, WIF, transfer(me.address, parseEther('10000')))
const wallet = createWalletClient({ account: me, chain, transport: http(RPC) })
await pub.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: WIF, data: transfer(friend, parseEther('2500')) }) })
await as(WHALE, WIF, transfer(fake, parseEther('1')))
await as(fake, WIF, transfer(me.address, 1n))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Import an existing wallet/ }).click()
  await page.getByRole('button', { name: 'Private key' }).click()
  await page.getByLabel('Private key').fill(key)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery 42')
  await page.getByLabel('Confirm password').fill('correct horse battery 42')
  await page.getByRole('button', { name: 'Encrypt & finish' }).click()
  await page.getByRole('button', { name: /Skip for now/ }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()

  await page.locator('aside').getByRole('link', { name: 'My $WIF journey' }).click()
  await page.getByTestId('journey-hero').waitFor({ timeout: 120000 })
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  assert(/YOU HOLD 7,500 WIF/i.test(text), 'holding: 7,500 WIF (10,000 in − 2,500 out)')
  assert(/From 1 sale/.test(text), 'one sale counted')
  assert(/Added 10,000 WIF/.test(text) && /Sold or sent 2,500 WIF/.test(text), 'moves list shows the add and the sale')
  assert(!/<0\.01 WIF|Added 0\.0/.test(text), 'dust from the look-alike address is ignored')
  assert(!/could not be loaded/.test(text), 'history adds up to the balance (no partial warning)')
  assert(/AVERAGE BUY PRICE \$0\.\d+/i.test(text), 'average buy price from the real $WIF market price')
  assert(/LAST SOLD/i.test(text) && !/Never 🙌/.test(text), 'last sale date shown')
  await page.screenshot({ path: `${OUT}/journey-fork.png`, fullPage: true })
  assert(!errors.length, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  console.log('\nJourney E2E passed')
} catch (e) {
  await page.screenshot({ path: `${OUT}/journey-failure.png` }).catch(() => {})
  console.error('FAILED:', String(e.message).split('\n')[0])
  process.exitCode = 1
} finally {
  await browser.close()
}
