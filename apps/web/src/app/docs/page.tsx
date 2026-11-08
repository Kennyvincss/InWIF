import { SitePage, Section } from '@/components/site/Site'
import { ROBINHOOD_MAINNET, ROBINHOOD_TESTNET, WIF_ADDRESS } from '@inwif/core'

export const metadata = { title: 'InWIF documentation' }

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h3 id={id} className="mt-12 scroll-mt-24 font-display text-2xl font-bold first:mt-0">{children}</h3>
}

export default function DocsPage() {
  const u = ROBINHOOD_MAINNET.uniswapV3!
  return (
    <SitePage>
      <Section eyebrow="Documentation" title="InWIF docs">
        <div className="grid gap-10 lg:grid-cols-[200px,1fr]">
          <nav className="hidden space-y-2 text-sm text-mute lg:block">
            {['architecture', 'network', 'hardware', 'developers', 'faq', 'privacy', 'terms'].map((s) => (
              <a key={s} href={`#${s}`} className="block capitalize hover:text-white">{s}</a>
            ))}
          </nav>
          <div className="prose-invert min-w-0 max-w-3xl space-y-4 break-words text-[15px] leading-relaxed text-mute [&_b]:text-white [&_code]:break-all [&_code]:text-accent-soft">
            <H id="architecture">Architecture</H>
            <p>InWIF is a monorepo. <b>packages/core</b> is the wallet engine shared by every client: network config, keystore, BIP-39 wallets, validation, transaction review and simulation, approvals, activity, market data, swaps, security quests and the hardware protocol. <b>apps/web</b> is this site and the web wallet (Next.js). <b>apps/api</b> is an optional backend for public, non-sensitive data (PostgreSQL). <b>apps/mobile</b> (Expo) and <b>apps/desktop</b> (Tauri) reuse the core. <b>firmware</b> holds the Rust signing core for the device.</p>
            <p>Signing is always local: in the browser for software wallets, on the device for hardware wallets. The backend never signs and never receives keys.</p>

            <H id="network">Network</H>
            <p><b>{ROBINHOOD_MAINNET.name}</b> — chain ID {ROBINHOOD_MAINNET.chainId}, gas in ETH, RPC <code>{ROBINHOOD_MAINNET.rpcUrls[0]}</code>, explorer <code>{ROBINHOOD_MAINNET.explorer.url}</code>.</p>
            <p><b>{ROBINHOOD_TESTNET.name}</b> — chain ID {ROBINHOOD_TESTNET.chainId}, RPC <code>{ROBINHOOD_TESTNET.rpcUrls[0]}</code>.</p>
            <p>$WIF: <code>{WIF_ADDRESS}</code>. Uniswap V3: factory <code>{u.factory}</code>, QuoterV2 <code>{u.quoterV2}</code>, SwapRouter02 <code>{u.swapRouter02}</code>, WETH9 <code>{u.weth9}</code>. Uniswap V4: Universal Router <code>{ROBINHOOD_MAINNET.uniswapV4!.universalRouter}</code>, Permit2 <code>{ROBINHOOD_MAINNET.uniswapV4!.permit2}</code>; swaps route through the reviewed $WIF/ETH pool (Pons, pool ID <code>{ROBINHOOD_MAINNET.uniswapV4!.pools[0]!.id}</code>) when it gives the better price. Sources: ethereum-lists/chains and the Uniswap SDK; every value is re-checked on-chain at runtime.</p>

            <H id="hardware">Hardware protocol (IWDP v1)</H>
            <p>Frames: <code>&apos;I&apos; &apos;W&apos; | version | cmd/status | len (u16 BE) | payload</code>. Commands: GET_INFO, GET_ADDRESS, SIGN_TX (BIP-32 path + unsigned EIP-1559 serialization), SIGN_MESSAGE, ATTEST (32-byte challenge), FIRMWARE_UPDATE. Responses carry a status byte (OK, USER_REJECTED, LOCKED, BAD_REQUEST, UNSUPPORTED, CHAIN_NOT_ALLOWED, BUSY, BAD_SIGNATURE, NOT_INITIALIZED). SIGN_TX returns <code>yParity ‖ r ‖ s</code>; the companion verifies the signature recovers to the expected account before broadcasting. Full spec: <code>docs/hardware/protocol.md</code>.</p>

            <H id="developers">Developers</H>
            <pre className="overflow-x-auto rounded-xl bg-ink-900 p-4 text-xs text-white">{`pnpm install
pnpm dev                      # web wallet on http://localhost:3000
pnpm test                     # core + web + api tests
cd firmware && cargo test     # firmware signing core`}</pre>

            <H id="faq">FAQ</H>
            <p><b>Is it free?</b> Yes — every feature, permanently. <b>Do I need $WIF?</b> No. <b>Can you recover my wallet?</b> No; only your recovery phrase can. <b>Is the hardware available?</b> Not yet; it is a prototype.</p>

            <H id="privacy">Privacy policy (summary)</H>
            <p>InWIF does not require an account. Keys and recovery phrases never leave your device. To show balances, prices and history, your browser (or the InWIF relay acting for it) queries public blockchain RPCs, the Blockscout explorer and GeckoTerminal with your public address or token addresses; those providers may log requests under their own policies. InWIF runs no analytics on the wallet.</p>

            <H id="terms">Terms of use (summary)</H>
            <p>InWIF is provided free, as-is, without warranty. You are solely responsible for your keys and transactions; blockchain transactions are irreversible. Third-party protocols (e.g. Uniswap) have their own fees and risks. The software is pre-release and unaudited. Nothing in InWIF is investment advice.</p>
          </div>
        </div>
      </Section>
    </SitePage>
  )
}
