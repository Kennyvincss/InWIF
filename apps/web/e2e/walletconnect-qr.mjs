/**
 * QR scanning E2E over the live WalletConnect relay.
 *  1. Camera: Chromium's fake camera plays a video of the dApp's real WalletConnect QR code;
 *     InWIF scans it and the connection is approved.
 *  2. Image: a screenshot-style PNG of a second dApp QR code is uploaded and decoded; the
 *     connection request appears and is rejected.
 *  3. A non-WalletConnect QR code is refused with a clear message.
 *   NODE_USE_ENV_PROXY=1 node e2e/walletconnect-qr.mjs   (server on :3000)
 */
import { chromium } from 'playwright'
import { SignClient } from '@walletconnect/sign-client'
import QRCode from 'qrcode'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const PROJECT_ID = process.env.WC_PROJECT_ID ?? '8b2edb1e560d95b69a5eac692b07b323'
const NS = 'eip155:4663'
const dir = mkdtempSync(path.join(tmpdir(), 'inwif-qr-'))
const ok = (m) => console.log(`  ✓ ${m}`)

async function newDapp(name) {
  const client = await SignClient.init({ projectId: PROJECT_ID, customStoragePrefix: `qr-${name}-${Date.now()}`, metadata: { name, description: 'QR test', url: 'https://inwif.vercel.app', icons: [] } })
  const { uri, approval } = await client.connect({ optionalNamespaces: { eip155: { chains: [NS], methods: ['personal_sign'], events: ['accountsChanged'] } } })
  return { client, uri, approval }
}

/** PNG of a QR code on a white page, like a dApp's connect dialog. */
async function qrPng(text, file) {
  writeFileSync(file, await QRCode.toBuffer(text, { margin: 4, width: 420, errorCorrectionLevel: 'M' }))
  return file
}

/** Y4M video (Chromium fake-camera format) showing the QR code, via Pillow. */
function qrY4m(png, file) {
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert('L')
W, H = 640, 480
frame = Image.new('L', (W, H), 255)
frame.paste(src, ((W - src.width) // 2, (H - src.height) // 2))
y = frame.tobytes()
uv = bytes([128]) * ((W // 2) * (H // 2))
with open(sys.argv[2], 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F10:1 Ip A1:1 C420jpeg\\n'.encode())
    for _ in range(20):
        f.write(b'FRAME\\n' + y + uv + uv)
`, png, file])
  return file
}

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined
const camDapp = await newDapp('QR Camera dApp')
const video = qrY4m(await qrPng(camDapp.uri, path.join(dir, 'cam.png')), path.join(dir, 'cam.y4m'))
const browser = await chromium.launch({
  proxy,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.grantPermissions(['camera'], { origin: BASE })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
try {
  // Wallet
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
  ok('wallet created')

  console.log('Camera scan')
  await page.getByRole('button', { name: 'Connect an app' }).click()
  await page.getByRole('button', { name: 'Scan QR code' }).click()
  await page.getByLabel('Camera preview for QR scanning').waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/screens/qr-01-camera.png' })
  await page.getByText('Connection request').waitFor({ timeout: 30000 })
  await page.getByText('QR Camera dApp').first().waitFor()
  await page.waitForTimeout(600)
  await page.getByRole('dialog').getByRole('button', { name: 'Connect', exact: true }).click()
  const session = await camDapp.approval()
  ok(`camera scanned the dApp's QR code; session ${session.namespaces.eip155.accounts[0]}`)
  await page.getByText('Connection request').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})

  console.log('Image upload')
  const imgDapp = await newDapp('QR Image dApp')
  const rejected = imgDapp.approval().then(() => 'approved', (e) => e)
  await page.getByRole('button', { name: 'Connect an app' }).click()
  await page.getByLabel('QR code image').setInputFiles(await qrPng(imgDapp.uri, path.join(dir, 'img.png')))
  await page.getByText('QR Image dApp').first().waitFor({ timeout: 30000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click()
  const r = await rejected
  if (r === 'approved') throw new Error('image-upload connection should have been rejected')
  ok('QR decoded from an uploaded image; connection request shown and rejected')

  console.log('Wrong QR')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Connect an app' }).click()
  await page.getByLabel('QR code image').setInputFiles(await qrPng('https://example.com/not-walletconnect', path.join(dir, 'wrong.png')))
  await page.getByText('That QR code is not a WalletConnect link.').waitFor({ timeout: 10000 })
  ok('non-WalletConnect QR code refused with a clear message')

  if (errors.length) throw new Error(`page errors: ${JSON.stringify(errors)}`)
  ok('no uncaught page errors')
  console.log('\nQR scanning E2E passed')
} catch (e) {
  console.error('FAILED:', String(e.message ?? e).split('\n')[0])
  await page.screenshot({ path: 'e2e/screens/qr-failure.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  process.exit(process.exitCode ?? 0)
}
