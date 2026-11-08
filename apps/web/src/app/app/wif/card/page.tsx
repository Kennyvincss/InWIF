'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { SECURITY_QUESTS, WIF_ADDRESS, shortAddress } from '@inwif/core'
import { useWallet } from '@/lib/wallet-store'
import { useActivity, usePortfolio } from '@/lib/hooks'
import { fmtUsd } from '@/lib/format'
import { SITE_URL } from '@/lib/site'
import { Notice, PageHeader, Skeleton, cx } from '@/components/ui'
import { holderTier } from '@/lib/wif-card'

const DAY = 86_400_000

interface CardData {
  tier: { name: string; emoji: string }
  amount: number | null
  valueUsd: number | null
  since: Date | null
  transfers: number
  badges: string[]
  address: string | null
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Draw the 1200×630 share card. Everything is rendered locally; nothing is uploaded. */
async function drawCard(canvas: HTMLCanvasElement, d: CardData) {
  const W = 1200
  const H = 630
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await document.fonts.ready
  const family = getComputedStyle(document.body).fontFamily
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono') || 'monospace'
  const font = (w: number, px: number, f = family) => `${w} ${px}px ${f}`

  // Background: true black with emerald and cyan light.
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(180, 80, 0, 180, 80, 620)
  g1.addColorStop(0, 'rgba(0,229,155,0.28)')
  g1.addColorStop(1, 'rgba(0,229,155,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)
  const g2 = ctx.createRadialGradient(1080, 600, 0, 1080, 600, 560)
  g2.addColorStop(0, 'rgba(34,229,255,0.20)')
  g2.addColorStop(1, 'rgba(34,229,255,0)')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // Frame
  roundRect(ctx, 24, 24, W - 48, H - 48, 32)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()

  const [logo, coin] = await Promise.all([loadImage('/icon.svg'), loadImage('/tokens/wif.webp')])
  ctx.drawImage(logo, 64, 60, 44, 44)
  ctx.fillStyle = '#fff'
  ctx.font = font(650, 28)
  ctx.textBaseline = 'middle'
  ctx.fillText('In', 120, 83)
  const inW = ctx.measureText('In').width
  ctx.fillStyle = '#00E59B'
  ctx.fillText('WIF', 120 + inW, 83)
  ctx.font = font(500, 16, mono)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.textAlign = 'right'
  ctx.fillText('WORLD IS FLAT · $WIF HOLDER CARD', W - 64, 83)
  ctx.textAlign = 'left'

  // Coin with glow
  ctx.save()
  ctx.shadowColor = 'rgba(0,229,155,0.55)'
  ctx.shadowBlur = 70
  ctx.beginPath()
  ctx.arc(230, 330, 130, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.arc(230, 330, 130, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(coin, 100, 200, 260, 260)
  ctx.restore()

  // Tier + amount
  const X = 420
  ctx.font = font(500, 18, mono)
  ctx.fillStyle = '#00E59B'
  ctx.fillText('$WIF  ' + d.tier.name.toUpperCase(), X, 190)
  ctx.font = font(650, 76)
  ctx.fillStyle = '#fff'
  ctx.fillText(`${d.tier.emoji} ${d.tier.name}`, X, 262)
  ctx.font = font(500, 34)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  if (d.amount !== null) ctx.fillText(`${Math.floor(d.amount).toLocaleString('en-US')} WIF${d.valueUsd ? `  ·  ${fmtUsd(d.valueUsd)}` : ''}`, X, 330)

  // Stats
  ctx.font = font(500, 15, mono)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('FIRST $WIF', X, 392)
  ctx.fillText('TRANSFERS', X + 260, 392)
  ctx.font = font(600, 28)
  ctx.fillStyle = '#fff'
  ctx.fillText(d.since ? d.since.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—', X, 428)
  ctx.fillText(String(d.transfers), X + 260, 428)

  // Badges
  let bx = X
  const by = 476
  ctx.font = font(600, 17)
  for (const b of d.badges.slice(0, 4)) {
    const w = ctx.measureText(b).width + 36
    if (bx + w > W - 64) break
    roundRect(ctx, bx, by, w, 40, 20)
    ctx.fillStyle = 'rgba(0,229,155,0.12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,229,155,0.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#7CFFCF'
    ctx.fillText(b, bx + 18, by + 21)
    bx += w + 12
  }

  // Footer
  ctx.font = font(500, 16, mono)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(d.address ?? 'SELF-CUSTODY ON ROBINHOOD CHAIN', 64, H - 64)
  ctx.textAlign = 'right'
  ctx.fillText(new URL(SITE_URL).host.toUpperCase(), W - 64, H - 64)
  ctx.textAlign = 'left'
}

export default function WifCardPage() {
  const { activeAccount, activeWallet, state } = useWallet()
  const address = activeAccount?.address
  const { rows, balances } = usePortfolio(address)
  const transfers = useActivity(address, WIF_ADDRESS)
  const [showAmount, setShowAmount] = useState(true)
  const [showAddress, setShowAddress] = useState(false)
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const wif = rows.find((r) => r.token?.isWif)

  const data: CardData | null = useMemo(() => {
    if (!wif || !transfers.data) return null
    const amount = wif.amount
    const list = transfers.data
    const times = list.map((t) => (t.timestamp ? Date.parse(t.timestamp) : NaN)).filter(Number.isFinite)
    const first = times.length ? new Date(Math.min(...times)) : null
    const now = Date.now()
    const recentOut = list.some((t) => t.direction === 'out' && t.timestamp && now - Date.parse(t.timestamp) < 30 * DAY)
    const badges: string[] = []
    if (amount > 0 && first && now - first.getTime() >= 30 * DAY && !recentOut) badges.push('💎 Diamond hands')
    if (first && now - first.getTime() >= 60 * DAY) badges.push('⏳ OG holder')
    if (list.length >= 10) badges.push('⚡ Active trader')
    if (activeWallet?.kind === 'mnemonic' && activeWallet.backedUp) badges.push('🔐 Backed up')
    if (Object.keys(state.quests).length >= SECURITY_QUESTS.length) badges.push('🛡 Security pro')
    return {
      tier: holderTier(amount),
      amount: showAmount ? amount : null,
      valueUsd: showAmount ? wif.valueUsd : null,
      since: first,
      transfers: list.length,
      badges,
      address: showAddress && address ? shortAddress(address) : null,
    }
  }, [wif, transfers.data, showAmount, showAddress, address, activeWallet, state.quests])

  useEffect(() => {
    if (data && canvas.current) void drawCard(canvas.current, data)
  }, [data])

  const blob = () => new Promise<Blob | null>((r) => canvas.current?.toBlob(r, 'image/png'))
  const download = async () => {
    const b = await blob()
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = 'my-wif-card.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const share = async () => {
    setBusy(true)
    try {
      const b = await blob()
      const file = b && new File([b], 'my-wif-card.png', { type: 'image/png' })
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My $WIF card', text: tweet })
      else await download()
    } catch {
      /* cancelled */
    } finally {
      setBusy(false)
    }
  }
  const tweet = data
    ? `I'm a $WIF ${data.tier.name} ${data.tier.emoji}${data.since ? ` — holding since ${data.since.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}. Self-custody on Robinhood Chain with InWIF.`
    : ''
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(SITE_URL)}`

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Your $WIF card"
        subtitle="A shareable card built from your public on-chain $WIF history. It is drawn on this device — nothing is uploaded."
        actions={
          <Link href="/app/wif" className="btn-ghost">
            Back to $WIF
          </Link>
        }
      />
      {activeWallet?.kind === 'watch' && <Notice>This card is for a watched address.</Notice>}
      <section className="card overflow-hidden p-3 sm:p-4">
        {!data ? (
          <Skeleton className="aspect-[1200/630] w-full rounded-xl" />
        ) : (
          <canvas ref={canvas} className="aspect-[1200/630] w-full rounded-xl" aria-label={`$WIF holder card: ${data.tier.name}`} />
        )}
      </section>
      {balances.isError && <Notice tone="warn">Your balance could not be read right now.</Notice>}
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-mute">
          <input type="checkbox" className="accent-[#00E59B]" checked={showAmount} onChange={(e) => setShowAmount(e.target.checked)} /> Show how much I hold
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-mute">
          <input type="checkbox" className="accent-[#00E59B]" checked={showAddress} onChange={(e) => setShowAddress(e.target.checked)} /> Show my address
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={download} disabled={!data}>
            <Download className="h-4 w-4" /> Download
          </button>
          <button className="btn-ghost" onClick={share} disabled={!data || busy}>
            <Share2 className="h-4 w-4" /> Share
          </button>
          <a className={cx('btn-primary', !data && 'pointer-events-none opacity-40')} href={intent} target="_blank" rel="noreferrer">
            Post on X
          </a>
        </div>
      </section>
      <p className="text-xs text-dim">Posting on X opens a draft with your text; attach the downloaded image to show the card. Badges come only from your public on-chain activity and this device.</p>
    </div>
  )
}
