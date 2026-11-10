/**
 * "Move ETH from Ethereum" E2E on a fork of Ethereum mainnet, against Robinhood Chain's real
 * bridge contracts. A fresh wallet holds 0.01 ETH on Ethereum; it sees the dashboard banner,
 * opens the bridge, moves 0.005 ETH and the deposit lands in the official bridge.
 * (Arrival on Robinhood Chain happens off-fork and is not part of this test.)
 *
 *   anvil --fork-url https://ethereum-rpc.publicnode.com --port 8546 &
 *   NEXT_PUBLIC_ETHEREUM_RPC_URL=http://127.0.0.1:8546 pnpm build && pnpm start &
 *   NODE_USE_ENV_PROXY=1 node e2e/bridge-fork.mjs
 */
import { chromium } from 'playwright'
import { createPublicClient, formatEther, http, keccak256, parseEther, toBytes, toHex } from 'viem'
import { mainnet } from 'viem/chains'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const L1 = process.env.L1_FORK_RPC_URL ?? 'http://127.0.0.1:8546'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const INBOX = '0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D'
const BRIDGE = '0xDf8755334ce7A73cCF6b581C02eA649AE3E864b3'
const pub = createPublicClient({ chain: mainnet, transport: http(L1) })
const assert = (c, m) => {
  if (!c) throw new Error(`ASSERT: ${m}`)
  console.log(`  ✓ ${m}`)
}

const key = generatePrivateKey()
const me = privateKeyToAccount(key).address
await pub.request({ method: 'anvil_setBalance', params: [me, toHex(parseEther('0.01'))] })
const bridgeBefore = await pub.getBalance({ address: BRIDGE })

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
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery 42')
  await page.getByLabel('Confirm password').fill('correct horse battery 42')
  await page.getByRole('button', { name: 'Encrypt & finish' }).click()
  await page.getByRole('button', { name: /Skip for now/ }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()

  console.log('Dashboard notices ETH on Ethereum')
  const banner = page.getByTestId('l1-banner')
  await banner.waitFor({ timeout: 30000 })
  assert(/You also have 0\.01 ETH on Ethereum/.test((await banner.textContent()) ?? ''), 'banner: "You also have 0.01 ETH on Ethereum"')
  await page.screenshot({ path: `${OUT}/bridge-banner.png` })
  await banner.getByRole('link', { name: 'Move to Robinhood Chain' }).click()

  console.log('Bridge page')
  await page.getByTestId('l1-balance').filter({ hasText: '0.01 ETH' }).waitFor({ timeout: 30000 })
  await page.getByText('Official Robinhood Chain bridge, checked on Ethereum').waitFor({ timeout: 30000 })
  assert(true, 'bridge contracts verified on-chain (inbox → bridge → rollup → chain 4663)')
  await page.getByRole('button', { name: '100%' }).click()
  const max = Number(await page.getByLabel('Amount').inputValue())
  assert(max > 0.009 && max < 0.01, `100% keeps the Ethereum fee back (${max} ETH)`)
  await page.getByLabel('Amount').fill('0.005')
  await page.screenshot({ path: `${OUT}/bridge-page.png` })
  await page.getByRole('button', { name: 'Review move' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Robinhood Chain official bridge').waitFor()
  assert(((await dialog.textContent()) ?? '').includes(INBOX), 'review names the official bridge inbox address')
  await page.screenshot({ path: `${OUT}/bridge-review.png` })
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: /Sign & move/ }).click()
  await dialog.getByText('Your ETH is on its way').waitFor({ timeout: 60000 })
  assert(true, 'signed on Ethereum and confirmed; waiting for arrival on Robinhood Chain')
  await page.screenshot({ path: `${OUT}/bridge-status.png` })

  console.log('On-chain (Ethereum fork)')
  const bridgeAfter = await pub.getBalance({ address: BRIDGE })
  assert(bridgeAfter - bridgeBefore === parseEther('0.005'), 'the official bridge received exactly 0.005 ETH')
  const block = await pub.getBlock({ includeTransactions: true })
  const tx = block.transactions.find((t) => t.from.toLowerCase() === me.toLowerCase())
  assert(tx && tx.to?.toLowerCase() === INBOX.toLowerCase() && tx.value === parseEther('0.005') && tx.input.startsWith('0x439370b1'), 'transaction: depositEth() to the inbox with 0.005 ETH')
  const receipt = await pub.getTransactionReceipt({ hash: tx.hash })
  const topic = keccak256(toBytes('InboxMessageDelivered(uint256,bytes)'))
  assert(receipt.logs.some((l) => l.address.toLowerCase() === INBOX.toLowerCase() && l.topics[0] === topic), 'the inbox emitted InboxMessageDelivered (deposit queued for Robinhood Chain)')
  const left = await pub.getBalance({ address: me })
  console.log(`    left on Ethereum: ${formatEther(left)} ETH`)
  assert(!errors.length, `no uncaught page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  console.log('\nBridge E2E passed')
} catch (e) {
  await page.screenshot({ path: `${OUT}/bridge-failure.png` }).catch(() => {})
  console.error('FAILED:', String(e.message).split('\n')[0])
  process.exitCode = 1
} finally {
  await browser.close()
}
