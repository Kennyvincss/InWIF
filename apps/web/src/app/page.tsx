'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Cpu,
  Eye,
  FileSearch,
  Fingerprint,
  KeyRound,
  Laptop,
  Layers,
  LineChart,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Usb,
  Wallet,
} from 'lucide-react'
import { ROBINHOOD_MAINNET, WIF_ADDRESS } from '@inwif/core'
import { Section, SitePage } from '@/components/site/Site'
import { DeviceRender, PhoneRender } from '@/components/site/DeviceRender'
import { LogoMark } from '@/components/Logo'

const fade = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.5 } }

const FEATURES = [
  { icon: Wallet, title: 'Unlimited wallets', body: 'Create or import as many wallets and accounts as you need. Rename, archive and switch instantly.' },
  { icon: LineChart, title: 'Real portfolio data', body: 'Balances read straight from Robinhood Chain; prices from on-chain DEX markets. Never estimated, never invented.' },
  { icon: ArrowLeftRight, title: 'Zero-fee swaps', body: 'The best price across verified Uniswap pools, including the main $WIF market. InWIF adds no fee — you see the pool fee and gas, nothing else.' },
  { icon: FileSearch, title: 'Simulate before you sign', body: 'Every transaction is simulated and decoded into plain language, with warnings for risky approvals.' },
  { icon: KeyRound, title: 'Approval manager', body: 'Find every live token allowance and revoke it in one tap. Unlimited approvals are flagged loudly.' },
  { icon: Layers, title: 'DeFi positions', body: 'Track Uniswap V3 liquidity positions, in-range status and uncollected fees — read-only, from the contracts.' },
]

const FAQ = [
  { q: 'Is InWIF really free?', a: 'Yes, permanently. There are no subscriptions, premium tiers, paywalls or InWIF service fees. The only cost of a transaction is the Robinhood Chain network fee, and for swaps the Uniswap pool fee — both shown before you confirm.' },
  { q: 'Do I need $WIF to use InWIF?', a: 'No. Every feature works identically whether you hold zero $WIF or a million. $WIF integrations are optional ways to take part in the World Is Flat ecosystem.' },
  { q: 'Where are my keys stored?', a: 'On your device only, encrypted with AES-256-GCM under a key derived from your password. InWIF servers never receive recovery phrases or private keys, and no InWIF API accepts them.' },
  { q: 'Can InWIF recover my wallet if I lose my phrase?', a: 'No. That is what self-custody means: only your recovery phrase can restore your wallet. Write it down and store it offline.' },
  { q: 'Can I buy the hardware wallet?', a: 'Not yet. InWIF One is a prototype in development. You can try the full hardware signing flow today with the built-in device simulator or a development board.' },
  { q: 'Has InWIF been audited?', a: 'Not yet. The code is open and tested, but no independent audit has been completed.' },
]

export default function Home() {
  return (
    <SitePage>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="absolute left-1/2 top-[-200px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-lime/[0.09] blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.1fr,1fr]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="chip border-lime/30 text-lime">
              <Sparkles className="h-3 w-3" /> Free forever · Built for Robinhood Chain
            </span>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Your Crypto.
              <br />
              Your Rules.
              <br />
              <span className="text-gradient">Your InWIF.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-mute">
              A new standard for self-custody. Secure your digital assets, manage your portfolio and experience the freedom of owning your keys.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app" className="btn-primary px-6 py-3 text-base">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#intro" className="btn-ghost px-6 py-3 text-base">
                Explore InWIF
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-mute">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-lime" /> Keys never leave your device</span>
              <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-lime" /> 0% InWIF fees</span>
              <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-lime" /> No account required</span>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1 }}>
            <DeviceRender />
          </motion.div>
        </div>
      </section>

      {/* INTRO */}
      <Section id="intro" eyebrow="Introducing InWIF" title={<>The convenience of a modern wallet. <span className="text-mute">The discipline of hardware security.</span></>}>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Wallet, t: 'Software wallet', b: 'A fast, beautiful self-custody wallet for web, mobile and desktop. Create, import, send, receive, swap and track — all free.' },
            { icon: Cpu, t: 'Hardware wallet', b: 'InWIF One keeps keys in dedicated hardware and asks you to confirm every signature with a physical button. (Prototype in development.)' },
            { icon: Sparkles, t: '$WIF ecosystem', b: 'A home for the World Is Flat community on Robinhood Chain: track, trade and take part — with nothing ever gated behind the token.' },
          ].map(({ icon: Icon, t, b }) => (
            <motion.div key={t} {...fade} className="card p-6">
              <Icon className="h-6 w-6 text-lime" />
              <h3 className="mt-4 font-display text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm text-mute">{b}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* HARDWARE */}
      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <Section eyebrow="Hardware wallet · Concept" title="InWIF One. Keys that never touch the internet.">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <DeviceRender />
            <div>
              <ul className="space-y-5">
                {[
                  { icon: Cpu, t: 'Secure element design', b: 'Keys generated and stored inside a certified secure element, with secure boot and authenticated firmware.' },
                  { icon: Eye, t: 'What you see is what you sign', b: 'The device decodes the transaction itself and shows the amount, recipient and network on its own screen.' },
                  { icon: Fingerprint, t: 'Physical confirmation', b: 'Nothing is signed without a press of the device button. PIN entered on-device; wiped after 10 wrong attempts.' },
                  { icon: Usb, t: 'USB-C, aluminium, offline', b: 'Compact aluminium enclosure with USB-C. Optional wireless only after independent review.' },
                ].map(({ icon: Icon, t, b }) => (
                  <li key={t} className="flex gap-4">
                    <span className="h-fit rounded-xl bg-lime/10 p-2.5 text-lime">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">{t}</p>
                      <p className="text-sm text-mute">{b}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/hardware" className="btn-primary">Hardware details</Link>
                <Link href="/app/hardware" className="btn-ghost">Try the simulator</Link>
              </div>
              <p className="mt-4 text-xs text-mute">InWIF One has not been manufactured or independently tested. Renders are illustrations of the proposed design.</p>
            </div>
          </div>
        </Section>
      </section>

      {/* SECURITY */}
      <Section id="security" eyebrow="Security architecture" title="Every safeguard, for every user. Free.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { t: 'Local key custody', b: 'BIP-39 phrases generated with audited libraries (@scure). AES-256-GCM vaults, PBKDF2 600k iterations, per wallet.' },
            { t: 'Live network verification', b: `Before signing, InWIF checks the RPC really is Robinhood Chain (chain ID ${ROBINHOOD_MAINNET.chainId}). Mismatch = signing disabled.` },
            { t: 'Simulation & decoding', b: 'Reverts caught before you pay gas. Transfers, approvals and contract calls explained in plain language.' },
            { t: 'Nothing secret on servers', b: 'No backend stores keys or phrases. The relay rejects any secret-shaped data. Logs are redacted.' },
          ].map((c) => (
            <motion.div key={c.t} {...fade} className="card p-5">
              <ShieldCheck className="h-5 w-5 text-lime" />
              <p className="mt-3 font-semibold">{c.t}</p>
              <p className="mt-1.5 text-sm text-mute">{c.b}</p>
            </motion.div>
          ))}
        </div>
        <Link href="/security" className="mt-6 inline-flex items-center gap-1 text-sm text-lime">
          Read the security model <ArrowRight className="h-4 w-4" />
        </Link>
      </Section>

      {/* FEATURES */}
      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <Section id="features" eyebrow="Wallet features" title="Everything you need. Nothing you pay for.">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <motion.div key={title} {...fade} className="card p-6">
                <Icon className="h-6 w-6 text-lime" />
                <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm text-mute">{body}</p>
              </motion.div>
            ))}
          </div>
        </Section>
      </section>

      {/* WIF */}
      <Section eyebrow="Powered by the World Is Flat ecosystem" title={<>$WIF, built in. <span className="text-mute">Never required.</span></>}>
        <div className="grid gap-8 lg:grid-cols-[1.2fr,1fr]">
          <div className="card relative overflow-hidden p-8">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime/15 blur-3xl" />
            <LogoMark size={48} />
            <p className="mt-6 text-lg">InWIF is the free, secure access point for the World Is Flat community on Robinhood Chain.</p>
            <ul className="mt-6 space-y-2 text-sm text-mute">
              <li>• Live $WIF dashboard: balance, verified contract data, market and transfer history</li>
              <li>• Zero-fee $WIF swaps at the best Uniswap price</li>
              <li>• Ecosystem profile from your public on-chain activity</li>
              <li>• A reviewed registry for apps built around $WIF</li>
            </ul>
            <Link href="/ecosystem" className="btn-primary mt-8">Explore the $WIF ecosystem</Link>
          </div>
          <div className="card p-6">
            <p className="label">Official $WIF contract</p>
            <p className="break-all font-mono text-sm">{WIF_ADDRESS}</p>
            <p className="mt-4 text-sm text-mute">
              InWIF reads the token&apos;s name, symbol and decimals directly from this contract on every load, and flags any mismatch. Holding $WIF never unlocks extra features —
              everyone gets the complete wallet.
            </p>
          </div>
        </div>
      </Section>

      {/* NETWORK */}
      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <Section eyebrow="Supported network" title="Built for Robinhood Chain.">
          <div className="grid gap-5 md:grid-cols-4">
            {[
              ['Network', ROBINHOOD_MAINNET.name],
              ['Chain ID', String(ROBINHOOD_MAINNET.chainId)],
              ['Gas token', ROBINHOOD_MAINNET.nativeCurrency.symbol],
              ['Explorer', 'Blockscout'],
            ].map(([k, v]) => (
              <div key={k} className="card p-5">
                <p className="text-xs uppercase tracking-wider text-mute">{k}</p>
                <p className="mt-2 font-display text-xl font-bold">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-mute">
            An Arbitrum Orbit L2 settling to Ethereum. Parameters sourced from the public chain registry and verified live against the RPC. Testnet (chain 46630) supported for development.
          </p>
        </Section>
      </section>

      {/* MOBILE + DESKTOP */}
      <Section eyebrow="Everywhere you are" title="Web today. Mobile and desktop next.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card flex flex-col items-center gap-8 p-8 sm:flex-row">
            <PhoneRender />
            <div>
              <Smartphone className="h-6 w-6 text-lime" />
              <h3 className="mt-3 font-display text-xl font-bold">Mobile app</h3>
              <p className="mt-2 text-sm text-mute">iOS and Android (React Native · Expo) with Face ID / fingerprint unlock and keys in the OS keychain. In development — app-store builds are not yet published.</p>
            </div>
          </div>
          <div className="card p-8">
            <Laptop className="h-6 w-6 text-lime" />
            <h3 className="mt-3 font-display text-xl font-bold">Desktop app</h3>
            <p className="mt-2 text-sm text-mute">
              A lightweight Tauri app for Windows and macOS (Linux-ready) with native USB access to InWIF hardware and the same wallet engine as the web. In development.
            </p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900 p-4">
              <div className="mb-3 flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-bad/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
              </div>
              <div className="grid grid-cols-[80px,1fr] gap-3">
                <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-2.5 rounded bg-white/10" />)}</div>
                <div>
                  <div className="h-5 w-28 rounded bg-white/80" />
                  <svg viewBox="0 0 200 50" className="mt-3 w-full"><path d="M0 40 C30 30 50 38 80 22 S140 18 200 6" stroke="#A6F36A" strokeWidth="2" fill="none" /></svg>
                </div>
              </div>
            </div>
            <Link href="/app" className="btn-primary mt-6">Use the web wallet now</Link>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <section className="border-t border-white/[0.06] bg-ink-900/40">
        <Section id="faq" eyebrow="FAQ" title="Questions, answered honestly.">
          <div className="grid gap-3 md:grid-cols-2">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="cursor-pointer list-none font-semibold">
                  {f.q}
                  <span className="float-right text-lime transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-mute">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      </section>

      {/* DOCS */}
      <Section eyebrow="Documentation" title="Open, documented, verifiable.">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { t: 'Architecture', b: 'How the wallet engine, hardware protocol, contracts and backend fit together.', h: '/docs#architecture' },
            { t: 'Security model', b: 'Threat model, key handling, simulation and what InWIF does not protect against.', h: '/security' },
            { t: 'Developers', b: 'Run InWIF locally, test against a local chain, build on IWDP.', h: '/docs#developers' },
          ].map((d) => (
            <Link key={d.t} href={d.h} className="card p-6 transition hover:border-lime/30">
              <BookOpen className="h-5 w-5 text-lime" />
              <p className="mt-3 font-semibold">{d.t}</p>
              <p className="mt-1.5 text-sm text-mute">{d.b}</p>
            </Link>
          ))}
        </div>
      </Section>
    </SitePage>
  )
}
