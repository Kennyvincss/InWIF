/**
 * WalletConnect end-to-end test over the REAL WalletConnect relay, against a local Anvil chain.
 *   anvil --chain-id 31337 &
 *   NEXT_PUBLIC_ENABLE_LOCAL_NETWORK=true pnpm build && pnpm start &
 *   NODE_USE_ENV_PROXY=1 node e2e/walletconnect.mjs      (proxy flag only behind an HTTPS proxy)
 * A scripted dApp (sign-client) connects to InWIF running in Chromium, then:
 * personal_sign (approved + verified), unlimited permit (rejected), eth_sendTransaction
 * (approved + confirmed on-chain), and disconnect from the Security Centre.
 */
import { chromium } from 'playwright'
import { SignClient } from '@walletconnect/sign-client'
import { createPublicClient, createWalletClient, http, parseEther, toHex, verifyMessage, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const OUT = process.env.SHOT_DIR ?? 'e2e/screens'
const PROJECT_ID = process.env.WC_PROJECT_ID ?? '8b2edb1e560d95b69a5eac692b07b323'
const RECIPIENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
// CHAIN_ID=4663 runs read-only against a deployed site on Robinhood Chain mainnet (no funding, no transaction).
const CHAIN = Number(process.env.CHAIN_ID ?? 31337)
const LOCAL = CHAIN === 31337
const NS = `eip155:${CHAIN}`
const pub = createPublicClient({ chain: foundry, transport: http(RPC) })
const funder = createWalletClient({ account: privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'), chain: foundry, transport: http(RPC) })
const ok = (m) => console.log(`  ✓ ${m}`)
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined

const browser = await chromium.launch({ proxy })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
let dapp
try {
  console.log('Wallet setup')
  await page.goto(`${BASE}/app`)
  await page.getByRole('button', { name: 'Create wallet' }).click()
  await page.getByRole('button', { name: /Reveal/ }).click()
  const words = await page.locator('ol li span.font-medium').allTextContents()
  await page.getByRole('button', { name: 'I wrote it down' }).click()
  for (const label of await page.locator('label[for^="w"]').allTextContents()) await page.getByLabel(label, { exact: true }).fill(words[Number(label.replace(/\D/g, '')) - 1])
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery 42')
  await page.getByLabel('Confirm password').fill('correct horse battery 42')
  await page.getByRole('button', { name: /Encrypt & finish/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('link', { name: 'Open my wallet' }).click()
  if (LOCAL) await page.getByLabel('Network').first().selectOption('local')
  await page.getByText(`chain ${CHAIN}`).first().waitFor({ timeout: 30000 })
  const me = JSON.parse(await page.evaluate(() => localStorage.getItem('inwif:v1'))).wallets[0].accounts[0].address
  if (LOCAL) await pub.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: me, value: parseEther('1') }) })
  ok(`InWIF wallet ${me} on chain ${CHAIN}${LOCAL ? ', funded' : ''}`)

  console.log('Connect')
  dapp = await SignClient.init({ projectId: PROJECT_ID, customStoragePrefix: `e2e-dapp-${Date.now()}`, metadata: { name: 'E2E Test dApp', description: 'InWIF WalletConnect test', url: 'https://inwif.vercel.app', icons: [] } })
  const { uri, approval } = await dapp.connect({
    optionalNamespaces: { eip155: { chains: [NS], methods: ['personal_sign', 'eth_sendTransaction', 'eth_signTypedData_v4'], events: ['accountsChanged', 'chainChanged'] } },
  })
  await page.getByRole('button', { name: 'Connect an app' }).click()
  await page.getByLabel('WalletConnect link').fill(uri)
  await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByText('Connection request').waitFor({ timeout: 30000 })
  await page.getByText('E2E Test dApp').first().waitFor()
  await page.waitForTimeout(600) // let the connect dialog finish closing
  await shot('wc-01-proposal')
  await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click()
  const session = await approval()
  const acct = session.namespaces.eip155.accounts.find((a) => a.startsWith(`${NS}:`))
  if (!acct?.endsWith(me)) throw new Error(`session account mismatch: ${acct}`)
  ok(`session approved through the live relay: ${acct}`)

  const req = (method, params) => dapp.request({ topic: session.topic, chainId: NS, request: { method, params } })

  console.log('personal_sign')
  const msg = stringToHex('Sign in to E2E Test dApp\nNonce: 1234')
  const sigP = req('personal_sign', [msg, me])
  await page.getByText('Sign in to E2E Test dApp').waitFor({ timeout: 30000 })
  await shot('wc-02-sign')
  await page.getByRole('dialog').getByRole('button', { name: 'Sign' }).click()
  const sig = await sigP
  if (!(await verifyMessage({ address: me, message: { raw: msg }, signature: sig }))) throw new Error('bad signature')
  ok('message signed in InWIF and verified by the dApp')

  console.log('permit (rejected)')
  const permit = {
    domain: { name: 'Test Token', version: '1', chainId: CHAIN, verifyingContract: '0x5FbDB2315678afecb367f032d93F642f64180aa3' },
    types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Permit',
    message: { owner: me, spender: RECIPIENT, value: (2n ** 256n - 1n).toString(), nonce: '0', deadline: '99999999999' },
  }
  const permitP = req('eth_signTypedData_v4', [me, JSON.stringify(permit)]).then(() => 'signed', (e) => e)
  await page.getByText('Token permit — grants spending rights').waitFor({ timeout: 30000 })
  await page.getByText('Risk: high').waitFor()
  const signDisabled = await page.getByRole('dialog').getByRole('button', { name: 'Sign' }).isDisabled()
  await shot('wc-03-permit')
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click()
  const permitResult = await permitP
  if (permitResult === 'signed' || permitResult?.code !== 4001) throw new Error(`expected 4001 rejection, got ${JSON.stringify(permitResult)}`)
  ok(`unlimited permit flagged high-risk (Sign disabled until acknowledged: ${signDisabled}) and rejected → dApp got 4001`)

  if (LOCAL) {
  console.log('eth_sendTransaction')
  const before = await pub.getBalance({ address: RECIPIENT })
  const txP = req('eth_sendTransaction', [{ from: me, to: RECIPIENT, value: toHex(parseEther('0.01')) }])
  await page.getByText('Requested by E2E Test dApp').waitFor({ timeout: 30000 })
  await page.getByText(/Would succeed at the current block/).waitFor({ timeout: 20000 })
  await shot('wc-04-tx')
  await page.getByRole('dialog').getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Sign & send' }).click()
  const hash = await txP
  const rcpt = await pub.waitForTransactionReceipt({ hash })
  const after = await pub.getBalance({ address: RECIPIENT })
  if (rcpt.status !== 'success' || after - before !== parseEther('0.01')) throw new Error('tx not confirmed as expected')
  ok(`transaction approved in InWIF; dApp received ${hash.slice(0, 12)}…, confirmed in block ${rcpt.blockNumber}`)
  await page.getByText('Confirmed on-chain').waitFor({ timeout: 30000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click()
  }

  console.log('Disconnect from Security Centre')
  const deleted = new Promise((res) => dapp.on('session_delete', res))
  await page.locator('aside').getByRole('link', { name: 'Security', exact: true }).click()
  await page.getByText('E2E Test dApp').first().waitFor({ timeout: 20000 })
  await shot('wc-05-connected-apps')
  await page.getByRole('button', { name: 'Disconnect' }).click()
  await Promise.race([deleted, new Promise((_, rej) => setTimeout(() => rej(new Error('no session_delete')), 20000))])
  ok('disconnected in InWIF; dApp received session_delete')

  if (errors.length) throw new Error(`page errors: ${JSON.stringify(errors)}`)
  ok('no uncaught page errors')
  console.log('\nWalletConnect E2E passed')
} catch (e) {
  console.error('FAILED:', String(e.message ?? e).split('\n')[0])
  await page.screenshot({ path: `${OUT}/wc-failure.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  process.exit(process.exitCode ?? 0)
}
