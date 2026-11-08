/**
 * Swap E2E against a fork of Robinhood Chain mainnet: buys $WIF with ETH through the
 * best route (the Pons pool on Uniswap V4), then sells it all back, which needs the two
 * Permit2 approval steps. Real contracts, real pool state, local chain.
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545 &   (8545: the only local port the site's CSP allows)
 *   NEXT_PUBLIC_ROBINHOOD_RPC_URL=http://127.0.0.1:8545 pnpm build && pnpm start &
 *   NODE_USE_ENV_PROXY=1 node e2e/swap-fork.mjs
 */
import { chromium } from 'playwright'
import { createPublicClient, defineChain, erc20Abi, formatEther, http, parseEther, toHex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const RPC = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8545'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const WIF = '0x5173b8eA6923c2d40267890D45C46a3480954773'
const chain = defineChain({ id: 4663, name: 'Robinhood Chain (fork)', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const pub = createPublicClient({ chain, transport: http(RPC) })
const assert = (c, m) => {
  if (!c) throw new Error(`ASSERT: ${m}`)
  console.log(`  ✓ ${m}`)
}
const wifOf = (a) => pub.readContract({ address: WIF, abi: erc20Abi, functionName: 'balanceOf', args: [a] })

// A fresh key: well-known test keys have sweeper code on mainnet, which the fork inherits.
const pk = generatePrivateKey()
const me = privateKeyToAccount(pk).address
await pub.request({ method: 'anvil_setBalance', params: [me, toHex(parseEther('1'))] })

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

async function signInDialog() {
  const dialog = page.getByRole('dialog')
  await dialog.getByText(/Would succeed at the current block/).waitFor({ timeout: 30000 })
  const pw = dialog.getByLabel('Wallet password')
  if (await pw.count()) await pw.fill('correct horse battery 42')
  const box = dialog.getByRole('checkbox')
  if (await box.count()) await box.first().check()
  await dialog.getByRole('button', { name: 'Sign & send' }).click()
  await page.getByText('Confirmed on-chain').waitFor({ timeout: 30000 })
  await dialog.getByRole('button', { name: 'Close' }).last().click()
}

try {
  console.log('Import a funded key')
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: /Import an existing wallet/ }).click()
  await page.getByRole('button', { name: 'Private key' }).click()
  await page.getByLabel('Private key').fill(pk)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery 42')
  await page.getByLabel('Confirm password').fill('correct horse battery 42')
  await page.getByRole('button', { name: 'Encrypt & finish' }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()

  console.log('Buy $WIF with ETH')
  await page.goto(`${BASE}/app/swap`)
  await page.getByLabel('Amount to swap').fill('0.01')
  await page.getByText('Minimum received').waitFor({ timeout: 30000 })
  const feeRow = await page.locator('div', { has: page.getByText('Trading fee', { exact: true }) }).last().textContent()
  assert(/1\.00%/.test(feeRow ?? ''), 'pool fee measured on-chain: 1.00%')
  await page.getByText(/% (below|above)$/).waitFor({ timeout: 30000 })
  const vsMarket = await page.getByText(/% (below|above)$/).first().textContent()
  assert(!(await page.getByText('Swap blocked').count()), `not blocked; compared with market: ${vsMarket}`)
  await page.screenshot({ path: `${OUT}/swap-pons-quote.png` })
  await page.getByRole('button', { name: 'Review swap' }).click()
  await signInDialog()
  const bought = await wifOf(me)
  assert(bought > parseEther('1000'), `received ${formatEther(bought)} WIF on-chain`)

  console.log('Sell all $WIF back (Permit2: two approvals, then the swap)')
  await page.getByRole('button', { name: 'Switch tokens' }).click()
  await page.getByRole('button', { name: '100%' }).click()
  await page.getByRole('button', { name: /Step 1: Approve WIF for swapping/ }).waitFor({ timeout: 30000 })
  assert(true, 'two approval steps shown for selling through the V4 pool')
  await page.getByRole('button', { name: /Step 1: Approve WIF for swapping/ }).click()
  await page.getByRole('dialog').getByText('Swap approvals').first().waitFor()
  assert(true, 'approval review names the recognised spender (Permit2, shown as "Swap approvals")')
  await signInDialog()
  await page.getByRole('button', { name: /Confirm the WIF swap allowance/ }).click()
  await page.getByRole('dialog').getByText('Approve token for swapping').waitFor()
  assert(true, 'Permit2 allowance decoded in the review (amount + expiry)')
  await signInDialog()
  await page.getByRole('button', { name: 'Review swap' }).waitFor()
  const ethBefore = await pub.getBalance({ address: me })
  await page.getByRole('button', { name: 'Review swap' }).click()
  await page.getByRole('dialog').getByText('Swap router').first().waitFor()
  await signInDialog()
  const ethAfter = await pub.getBalance({ address: me })
  assert((await wifOf(me)) === 0n, 'all WIF sold')
  assert(ethAfter > ethBefore, `received ETH back (net of gas: +${formatEther(ethAfter - ethBefore)})`)
  assert(errors.length === 0, `no uncaught page errors ${errors.join('; ')}`)
  console.log('\nSwap fork E2E passed')
} catch (e) {
  await page.screenshot({ path: `${OUT}/swap-fork-failure.png` }).catch(() => {})
  console.error(e)
  process.exitCode = 1
} finally {
  await browser.close()
}
