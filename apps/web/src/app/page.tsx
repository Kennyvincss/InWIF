'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, Check, Eye, HandCoins, IdCard, KeyRound, Layers, Lock, Radio, ScanSearch, ShieldCheck, Smartphone, Sparkles, Wallet, Zap } from 'lucide-react'
import { WIF_ADDRESS } from '@inwif/core'
import { Section, SitePage } from '@/components/site/Site'
import { DeviceRender } from '@/components/site/DeviceRender'
import { CopyButton, TokenIcon, cx } from '@/components/ui'
import { market } from '@/lib/market-client'
import { fmtPct, fmtUsd } from '@/lib/format'
import { HARDWARE_ENABLED } from '@/lib/features'

const rise = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }

const FAQ = [
  { q: 'Is InWIF really free?', a: 'Yes, permanently. There are no subscriptions, premium tiers, paywalls or InWIF service fees. The only costs are the network fee and, for swaps, the trading fee — both shown before you confirm.' },
  { q: 'Do I need $WIF to use InWIF?', a: 'No. Every feature works the same whether you hold zero $WIF or a million. $WIF features are optional ways to take part in the World Is Flat ecosystem.' },
  { q: 'Where are my keys stored?', a: 'Only on your device, encrypted with your password. InWIF never receives your recovery phrase or private keys.' },
  { q: 'Can InWIF recover my wallet if I lose my phrase?', a: 'No. That is what self-custody means: only your recovery phrase can restore your wallet. Write it down and keep it offline.' },
  { q: 'Can I buy the hardware wallet?', a: 'Not yet. The InWIF One hardware wallet is in development and coming soon.' },
  { q: 'Has InWIF been audited?', a: 'Not yet. The code is tested and reviewed internally; an independent audit is planned before launch.' },
]

/** A tiny, static sparkline path for illustrations. */
const SPARK = 'M0 62 L28 58 L56 60 L84 44 L112 49 L140 40 L168 46 L196 28 L224 33 L252 22 L280 30 L308 14 L336 20 L364 8 L400 12'

function useWifMarket() {
  return useQuery({ queryKey: ['landing-wif'], queryFn: () => market.token('robinhood', WIF_ADDRESS), staleTime: 60_000, retry: 1 })
}

export default function Home() {
  const wif = useWifMarket()
  return (
    <SitePage>
      {/* HERO */}
      <section className="relative -mt-[76px] overflow-hidden pt-[76px]">
        <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="pointer-events-none absolute left-1/2 top-[-260px] h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,229,155,.18),rgba(34,229,255,.08)_55%,transparent)] blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-20 text-center sm:pt-28">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-mute backdrop-blur">
              <span className="live-dot" /> Live on Robinhood Chain<span className="hidden sm:inline"> · Free forever</span>
            </span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-8 max-w-5xl font-display text-[46px] font-semibold leading-[1] sm:text-[68px] lg:text-[86px]"
          >
            <span className="text-fade lg:whitespace-nowrap">Your Crypto. Your Rules.</span>
            <br />
            <span className="text-gradient">Your InWIF.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.15 }} className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-mute">
            The self-custody wallet for Robinhood Chain. Hold, send and swap with keys that never leave your device — and never pay InWIF a cent.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.22 }} className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/app" className="btn-primary px-6 py-3 text-[15px]">
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="btn-ghost px-6 py-3 text-[15px]">
              See what it does
            </a>
          </motion.div>
        </div>

        {/* PRODUCT PREVIEW */}
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto max-w-5xl px-5 pb-6">
          <div className="pointer-events-none absolute inset-x-10 bottom-0 top-16 rounded-[40px] bg-accent/10 blur-3xl" />
          <div className="lg:[transform:perspective(2200px)_rotateX(10deg)]">
            <ProductPreview price={wif.data?.priceUsd ?? null} change={wif.data?.change24hPct ?? null} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
        </motion.div>
      </section>

      {/* STATS STRIP */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015] md:grid-cols-4">
          {[
            {
              k: '$WIF price',
              v: wif.data?.priceUsd ? fmtUsd(wif.data.priceUsd) : '—',
              sub: wif.data?.change24hPct !== undefined && wif.data?.change24hPct !== null ? `${fmtPct(wif.data.change24hPct)} 24h` : 'Live market',
              tone: (wif.data?.change24hPct ?? 0) >= 0 ? 'text-accent' : 'text-bad',
              live: true,
            },
            { k: 'InWIF fees', v: '0%', sub: 'On everything, forever' },
            { k: 'Custody', v: '100%', sub: 'Your keys, your device' },
            { k: 'Accounts needed', v: 'None', sub: 'No sign-up, no email' },
          ].map((s, i) => (
            <div key={s.k} className={cx('p-6 sm:p-7', i % 2 === 1 && 'border-l border-white/[0.07]', i >= 2 && 'border-t border-white/[0.07] md:border-t-0', i === 2 && 'md:border-l')}>
              <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
                {s.live && <span className="live-dot" />} {s.k}
              </p>
              <p className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{s.v}</p>
              <p className={cx('mt-1 text-sm', s.tone ?? 'text-mute')}>{s.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES — BENTO */}
      <Section id="features" eyebrow="The wallet" title={<>Everything you need. <span className="text-mute">Nothing you pay for.</span></>}>
        <div className="grid gap-4 md:grid-cols-6">
          <Bento className="md:col-span-4" icon={Zap} title="Swap at the best price" body="Trade ETH and $WIF at the best available price in a couple of taps. InWIF adds no fee — you see exactly what you get before you confirm.">
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <TokenPill symbol="ETH" amount="0.25" />
              <ArrowRight className="h-4 w-4 text-dim" />
              <TokenPill symbol="WIF" amount="≈ best price" />
              <span className="ml-auto rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">0% InWIF fee</span>
            </div>
          </Bento>
          <Bento className="md:col-span-2" icon={Eye} title="See before you sign" body="Every transaction is checked first and explained in plain words.">
            <ul className="mt-5 space-y-2 font-mono text-[12px]">
              {['Would succeed', 'Network verified', 'No risky approvals'].map((t) => (
                <li key={t} className="flex items-center gap-2 text-mute">
                  <Check className="h-3.5 w-3.5 text-accent" /> {t}
                </li>
              ))}
            </ul>
          </Bento>
          <Bento className="md:col-span-2" icon={Sparkles} title="Real portfolio data" body="Balances straight from the chain and live market prices. Never estimated.">
            <svg viewBox="0 0 400 70" className="mt-5 h-14 w-full" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="bento-spark" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#22E5FF" stopOpacity=".3" />
                  <stop offset="1" stopColor="#22E5FF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${SPARK} L400 70 L0 70 Z`} fill="url(#bento-spark)" />
              <path d={SPARK} fill="none" stroke="#22E5FF" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 6px rgba(34,229,255,.6))' }} />
            </svg>
          </Bento>
          <Bento className="md:col-span-2" icon={KeyRound} title="Approval manager" body="See every app allowed to spend your tokens, and revoke it in one tap." />
          <Bento className="md:col-span-2" icon={Wallet} title="Unlimited wallets" body="Create or import as many wallets and accounts as you like. Switch instantly." />
          <Bento className="md:col-span-3" icon={Lock} title="Keys stay with you" body="Your recovery phrase is created and encrypted on your device. InWIF never sees it, and nothing outside InWIF can ask your wallet to sign." />
          <Bento className="md:col-span-3" icon={Layers} title="Free. Forever." body="No subscriptions, no premium tier, no paywalls. Every feature, for every user.">
            <p className="mt-4 font-display text-6xl font-semibold text-accent drop-shadow-[0_0_24px_rgba(0,229,155,.45)]">0%</p>
          </Bento>
        </div>
      </Section>

      {/* COMMUNITY FEATURES */}
      <Section eyebrow="For the $WIF community" title={<>Built for $WIF. <span className="text-mute">Free for everyone.</span></>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Radio, t: 'Live $WIF terminal', b: 'Every buy and sell as it happens, buy-vs-sell pressure and whale alerts.', h: '/app/wif/live', tag: 'Live' },
            { icon: ScanSearch, t: 'Token safety check', b: 'Paste any token and InWIF tests it for copycats, hidden taxes and tokens you can’t sell.', h: '/app/check', tag: 'Protect' },
            { icon: HandCoins, t: 'Pay me in $WIF', b: 'Send a link or QR code. Whoever opens it gets the amount filled in and just confirms.', h: '/app/receive', tag: 'Pay' },
            { icon: IdCard, t: 'Your $WIF card', b: 'A shareable holder card with your tier and badges, built from your own on-chain history.', h: '/app/wif/card', tag: 'Share' },
            { icon: Smartphone, t: 'Install it like an app', b: 'Add InWIF to your home screen on any phone or desktop. No app store needed.', h: '/app/settings', tag: 'Install' },
            { icon: Zap, t: 'Best-price $WIF swaps', b: 'Routed to the real $WIF market, with a guard that blocks swaps far below the market price.', h: '/app/swap', tag: 'Trade' },
          ].map((f) => (
            <motion.div key={f.t} {...rise}>
              <Link href={f.h} className="card card-hover group flex h-full flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className="inline-grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] transition group-hover:border-accent/40 group-hover:text-accent group-hover:shadow-glow-soft">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{f.tag}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.t}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-mute">{f.b}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm text-accent">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* $WIF */}
      <Section eyebrow="World Is Flat" title={<>$WIF, built in. <span className="text-mute">Never required.</span></>}>
        <div className="card overflow-hidden">
          <div className="grid items-center gap-10 p-8 sm:p-10 lg:grid-cols-[auto,1fr]">
            <div className="relative mx-auto">
              <div className="absolute inset-0 rounded-full bg-accent/25 blur-3xl" />
              <TokenIcon symbol="WIF" size={140} />
            </div>
            <div className="min-w-0">
              <p className="text-lg leading-relaxed text-white/90">The free, secure home for the World Is Flat community on Robinhood Chain: a live $WIF dashboard, zero-fee swaps and your on-chain ecosystem profile.</p>
              <div className="mt-6 flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/60 px-3 py-2">
                <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim">Contract</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-mute">{WIF_ADDRESS}</span>
                <CopyButton value={WIF_ADDRESS} />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/app/swap" className="btn-primary">
                  Get $WIF <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/ecosystem" className="btn-ghost">
                  Explore the ecosystem
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* HARDWARE */}
      <Section eyebrow="InWIF One" title={<>A hardware wallet. <span className="text-mute">Coming soon.</span></>}>
        <div className="card grid items-center gap-8 overflow-hidden p-6 sm:p-10 lg:grid-cols-2">
          <DeviceRender />
          <div>
            <ul className="space-y-5">
              {[
                { t: 'Keys that never touch the internet', b: 'Generated and kept inside dedicated hardware.' },
                { t: 'What you see is what you sign', b: 'The device shows the amount and recipient on its own screen.' },
                { t: 'A physical button for every signature', b: 'Nothing is signed until you press it.' },
              ].map((x) => (
                <li key={x.t} className="flex gap-4">
                  <span className="mt-1 h-fit rounded-lg border border-accent/25 bg-accent/10 p-1.5 text-accent">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium">{x.t}</p>
                    <p className="text-sm text-mute">{x.b}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/hardware" className="btn-ghost">
                About InWIF One
              </Link>
              {HARDWARE_ENABLED ? (
                <Link href="/app/hardware" className="btn-ghost">
                  Try the simulator
                </Link>
              ) : (
                <span className="chip">Coming soon</span>
              )}
            </div>
            <p className="mt-5 text-xs text-dim">Concept render. InWIF One has not been manufactured or independently tested yet.</p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Questions, answered honestly.">
        <div className="card divide-y divide-white/[0.06] px-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                {f.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/[0.1] text-mute transition group-open:rotate-45 group-open:border-accent/40 group-open:text-accent">+</span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mute">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* FINAL CTA */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24">
        <div className="card relative overflow-hidden px-6 py-16 text-center sm:py-20">
          <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[42rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl" />
          <h2 className="relative font-display text-[36px] font-semibold leading-tight sm:text-[56px]">
            <span className="text-fade">Own your keys.</span> <span className="text-gradient">Start in seconds.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-mute">No sign-up, no email, no fees. Just a wallet that is yours.</p>
          <Link href="/app" className="btn-primary relative mt-8 px-7 py-3 text-[15px]">
            Create your wallet <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </SitePage>
  )
}

function Bento({ className, icon: Icon, title, body, children }: { className?: string; icon: typeof Zap; title: string; body: string; children?: React.ReactNode }) {
  return (
    <motion.div {...rise} className={cx('card card-hover group overflow-hidden p-6 sm:p-7', className)}>
      <span className="inline-grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white transition group-hover:border-accent/40 group-hover:text-accent group-hover:shadow-glow-soft">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-mute">{body}</p>
      {children}
    </motion.div>
  )
}

function TokenPill({ symbol, amount }: { symbol: string; amount: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/60 py-1.5 pl-1.5 pr-3.5">
      <TokenIcon symbol={symbol} size={26} />
      <span className="text-sm font-medium">{symbol}</span>
      <span className="font-mono text-xs text-mute">{amount}</span>
    </span>
  )
}

/** Illustrative product preview built from real UI parts (sample amounts, live $WIF price). */
function ProductPreview({ price, change }: { price: number | null; change: number | null }) {
  const rows = [
    { s: 'WIF', n: 'World is Flat', a: '1,250,000', v: price ? fmtUsd(price * 1_250_000) : '—', c: change },
    { s: 'ETH', n: 'Ether', a: '0.84', v: '$1,880.00', c: null },
    { s: 'USDG', n: 'Global Dollar', a: '420.00', v: '$420.00', c: 0 },
  ]
  return (
    <div className="card overflow-hidden bg-[#060608]/90 text-left">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="ml-3 hidden font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim sm:inline">inwif · portfolio</span>
        <span className="ml-auto inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
          <span className="live-dot" /> Robinhood Chain
        </span>
      </div>
      <div className="grid gap-px bg-white/[0.05] md:grid-cols-[1.5fr,1fr]">
        <div className="bg-[#060608] p-5 sm:p-7">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">Total balance · sample</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <p className="font-display text-4xl font-semibold sm:text-5xl">$14,872.40</p>
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">+4.21%</span>
          </div>
          <svg viewBox="0 0 400 70" className="mt-6 h-24 w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="hero-spark" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#22E5FF" stopOpacity=".28" />
                <stop offset="1" stopColor="#22E5FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${SPARK} L400 70 L0 70 Z`} fill="url(#hero-spark)" />
            <path d={SPARK} fill="none" stroke="#22E5FF" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px rgba(34,229,255,.6))' }} />
          </svg>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {['Send', 'Receive', 'Swap', 'Stake'].map((a, i) => (
              <span key={a} className={cx('rounded-xl border py-2 text-center text-xs font-medium', i === 2 ? 'border-white bg-white text-black' : 'border-white/[0.08] bg-white/[0.02] text-white')}>
                {a}
              </span>
            ))}
          </div>
        </div>
        <div className="bg-[#060608] p-5 sm:p-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">Assets</p>
          <ul className="mt-3 divide-y divide-white/[0.05]">
            {rows.map((r) => (
              <li key={r.s} className="flex items-center gap-3 py-3">
                <TokenIcon symbol={r.s} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.n}</p>
                  <p className="font-mono text-[11px] text-dim">
                    {r.a} {r.s}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{r.v}</p>
                  {r.c !== null && <p className={cx('font-mono text-[11px]', r.c >= 0 ? 'text-accent' : 'text-bad')}>{fmtPct(r.c)}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/60 p-3">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">Swap</p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <TokenIcon symbol="ETH" size={20} /> ETH <ArrowRight className="h-3.5 w-3.5 text-dim" /> <TokenIcon symbol="WIF" size={20} /> WIF
              <span className="ml-auto font-mono text-[11px] text-accent">0% fee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
