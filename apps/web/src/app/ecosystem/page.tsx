'use client'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { WIF_ADDRESS, explorerTokenUrl, ROBINHOOD_MAINNET } from '@inwif/core'
import { SitePage, Section } from '@/components/site/Site'
import { ECOSYSTEM_APPS, LISTING_CRITERIA } from '@/lib/ecosystem'
import { useWallet } from '@/lib/wallet-store'

function ConnectPanel() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const wallet = useWallet()
  const bal = useReadContract({ address: WIF_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: 4663, query: { enabled: !!address } })
  const injected = connectors[0]
  return (
    <div id="connect" className="card scroll-mt-24 p-6">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Wallet className="h-5 w-5 text-lime" /> Connect a wallet to view your $WIF profile</h3>
      <p className="mt-1 text-sm text-mute">Read-only. InWIF only reads your public address and $WIF balance; it never asks this wallet to sign.</p>
      {!isConnected ? (
        <div className="mt-4">
          <button className="btn-primary" disabled={!injected || isPending} onClick={() => injected && connect({ connector: injected })}>
            {isPending ? 'Connecting…' : 'Connect browser wallet'}
          </button>
          {error && <p className="mt-2 text-sm text-bad">{error.message.split('\n')[0]}</p>}
          <p className="mt-3 text-xs text-mute">No browser wallet? <Link href="/app" className="text-lime">Create a free InWIF wallet</Link> instead.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2 text-sm">
          <p className="break-all font-mono">{address}</p>
          <p>
            $WIF balance:{' '}
            <b>{bal.data !== undefined ? Number(formatUnits(bal.data, 18)).toLocaleString() : bal.isError ? 'unavailable' : '…'}</b>
            {chainId !== 4663 && <span className="ml-2 text-xs text-warn">(read from Robinhood Chain regardless of your wallet&apos;s current network)</span>}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              className="btn-ghost"
              onClick={() => {
                if (!wallet.state.wallets.some((w) => w.accounts.some((a) => a.address === address))) wallet.addWatchWallet({ name: 'Connected wallet (watch)', address: address! })
                window.location.href = '/app/wif'
              }}
            >
              Track in InWIF (watch-only)
            </button>
            <button className="btn-ghost" onClick={() => disconnect()}>Disconnect</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EcosystemPage() {
  return (
    <SitePage>
      <Section eyebrow="Powered by the World Is Flat Ecosystem" title={<>InWIF is the free front door to <span className="text-gradient">$WIF</span>.</>}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 text-mute">
            <p>World Is Flat ($WIF) is a community token on Robinhood Chain. InWIF gives that community a secure, self-custody wallet with first-class $WIF support — and asks nothing in return.</p>
            <p className="flex gap-2 rounded-xl border border-lime/25 bg-lime/[0.06] p-4 text-sm text-lime-soft">
              <ShieldCheck className="h-5 w-5 shrink-0" /> You never need to hold, spend or stake $WIF to use any InWIF feature. No token payments, no burns, no hidden deductions.
            </p>
            <div className="card p-5">
              <p className="label">Official contract · {ROBINHOOD_MAINNET.name}</p>
              <p className="break-all font-mono text-sm text-white">{WIF_ADDRESS}</p>
              <a className="mt-2 inline-block text-xs text-lime" href={explorerTokenUrl(ROBINHOOD_MAINNET, WIF_ADDRESS)} target="_blank" rel="noreferrer">View on explorer ↗</a>
            </div>
          </div>
          <ConnectPanel />
        </div>
      </Section>
      <Section eyebrow="What you can do with $WIF in InWIF" title="Real, on-chain utility.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Track', 'Balance, verified contract metadata, holders, liquidity, price history and your full transfer history.'],
            ['Trade', 'Swap to and from $WIF via the verified Uniswap V3 deployment. Zero InWIF fee; pool fee disclosed.'],
            ['Send & receive', 'Validated addresses, decoded reviews and simulation for every $WIF transfer.'],
            ['Protect', 'See and revoke every contract allowed to spend your $WIF.'],
            ['Participate', 'Ecosystem profile from public on-chain activity, plus free security quests.'],
            ['Discover', 'A reviewed registry of applications built around $WIF, with clear listing criteria.'],
          ].map(([t, b]) => (
            <div key={t} className="card p-5">
              <Sparkles className="h-5 w-5 text-lime" />
              <p className="mt-3 font-semibold">{t}</p>
              <p className="mt-1.5 text-sm text-mute">{b}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section eyebrow="Ecosystem applications" title="Built around $WIF.">
        <div className="grid gap-4 md:grid-cols-3">
          {ECOSYSTEM_APPS.map((a) => (
            <Link key={a.id} href={a.href} className="card p-5 hover:border-lime/30">
              <p className="font-semibold">{a.name} <span className="chip ml-1">{a.status}</span></p>
              <p className="mt-1.5 text-sm text-mute">{a.description}</p>
            </Link>
          ))}
        </div>
        <div className="mt-6 text-sm text-mute">
          <p className="font-semibold text-white">Listing criteria for third-party apps</p>
          <ul className="mt-2 list-disc pl-5">{LISTING_CRITERIA.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-3">InWIF does not invent governance rights: holding $WIF does not by itself grant voting power. If the World Is Flat community launches on-chain governance, InWIF will integrate it as it actually works.</p>
        </div>
      </Section>
    </SitePage>
  )
}
