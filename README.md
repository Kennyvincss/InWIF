# InWIF

**Your Assets. Your Keys. Your Control.**

InWIF is a free, self-custody wallet ecosystem for **Robinhood Chain**, built for the
**World Is Flat ($WIF)** community. It includes:

- a web wallet
- mobile and desktop companion apps
- a hardware-wallet prototype with its own signing protocol and firmware core

> **InWIF is free.** No subscriptions, no premium plans, no paywalls, no InWIF service fees,
> and no feature ever requires holding or spending $WIF. The only costs are Robinhood Chain gas,
> plus, for swaps, the Uniswap pool fee. Both are shown before you confirm.

> **Status: pre-release, not independently audited.** The InWIF One hardware wallet is a
> prototype: no device has been manufactured or independently tested.

## What works today

| Area | Status |
|---|---|
| Web wallet: create (12/24 words + backup quiz), import (phrase / key), watch-only, unlimited wallets & accounts | ✅ |
| Live chain-ID verification before every signature | ✅ |
| Portfolio: on-chain balances, GeckoTerminal prices, 24h/7d/30d/90d/all charts, allocation | ✅ |
| Send / receive: EIP-681 QR, address checks, simulation, decoded review, fee disclosure, receipt | ✅ |
| Swaps: Uniswap V3 (QuoterV2 + SwapRouter02), slippage, price impact, exact approvals, **0% InWIF fee** | ✅ |
| $WIF dashboard: verified on-chain metadata, market, holders, history, profile, quests, app registry | ✅ |
| DeFi: Uniswap V3 LP position tracking (staking/lending: none verified yet, so none shown) | ✅ |
| Security Centre: approval discovery + revoke, flagged addresses, checklist, devices, connected apps | ✅ |
| WalletConnect (Reown WalletKit): connect to dApps; transactions, messages and typed data reviewed in InWIF; permit detection | ✅ |
| Hardware: IWDP v1 protocol, browser simulator, WebSerial, attestation, signed firmware, offline signing | ✅ prototype |
| Firmware core (Rust, `no_std`): byte-identical signatures with the TS companion; builds for Cortex-M4F | ✅ prototype |
| Backend API (Fastify + PostgreSQL): public data, wallet-signature login, no secrets | ✅ |
| Mobile (Expo): keychain + biometrics, portfolio, send, receive, $WIF, simulator | ✅ JS bundle; native builds need Xcode / Android SDK |
| Desktop (Tauri): wallet UI + native USB-serial transport | ✅ compiles on Linux; Windows/macOS packaging needs those hosts |

## Repository layout

```
packages/core     Wallet engine shared by every client (TypeScript, viem, @scure)
apps/web          Landing site + web wallet (Next.js, Tailwind, Framer Motion, wagmi)
apps/api          Public-data backend (Fastify, PostgreSQL, optional Redis)
apps/mobile       iOS / Android app (Expo, React Native)
apps/desktop      Desktop app (Tauri 2) with native USB transport
firmware          Hardware-wallet firmware core (Rust, no_std)
docs              Architecture, security, hardware, deployment, testing, research
```

## Quick start

```bash
pnpm install
pnpm dev                     # http://localhost:3000 (landing) and /app (wallet)
```

Run against a local chain for real end-to-end transactions:

```bash
anvil --chain-id 31337 &
cd apps/web && NEXT_PUBLIC_ENABLE_LOCAL_NETWORK=true pnpm build && pnpm start &
node e2e/smoke.mjs           # creates a wallet, sends real txs (software + hardware simulator)
```

See [docs/deployment.md](docs/deployment.md) and [docs/testing.md](docs/testing.md).

**Going live:** follow [docs/LAUNCH_GUIDE.md](docs/LAUNCH_GUIDE.md), which covers everything needed to make InWIF fully functional, step by step.

## Network

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 4663 | 46630 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com/rpc` |
| Explorer | `https://robinhoodchain.blockscout.com` | `https://explorer.testnet.chain.robinhood.com` |
| Gas | ETH | Sepolia ETH |

- **$WIF:** `0x5173b8eA6923c2d40267890D45C46a3480954773`. Its name, symbol and decimals are read on-chain at runtime and any mismatch is flagged.
- **Sources:** parameters come from `ethereum-lists/chains` and the Uniswap SDK. See [docs/research.md](docs/research.md).

## License

MIT
