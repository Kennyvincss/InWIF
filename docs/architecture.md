# Architecture

```
            ┌──────────────── clients ─────────────────┐
            │  apps/web     apps/mobile    apps/desktop│
            │  (Next.js)    (Expo)         (Tauri)     │
            └───────┬────────────┬─────────────┬───────┘
                    │  all import @inwif/core  │
            ┌───────▼──────────────────────────▼───────┐
            │ packages/core                            │
            │  networks · client/verify · keystore     │
            │  mnemonic · validation · risk · simulate │
            │  approvals · activity · market · swap    │
            │  defi · quests · signer · redact         │
            │  hardware/{protocol,simulator,companion, │
            │            vendor,webserial}             │
            └──┬───────────┬──────────────┬────────────┘
               │ JSON-RPC  │ REST          │ IWDP v1 frames
   Robinhood Chain RPC   Blockscout /    InWIF device (firmware/)
                         GeckoTerminal   or simulator
```

## Principles

1. **Keys stay local.**
   - Software wallets decrypt in memory only after a password (web) or biometric prompt (mobile).
   - Hardware wallets never export keys.
   - No API, relay or backend accepts key material: `containsSecret` rejects any request that carries secret-shaped data.
2. **One signing pipeline.** Every client goes through the same steps:
   1. `verifyNetwork`
   2. `simulateTransaction` and `estimateFees`
   3. `reviewTransaction` (decoded, with risk findings)
   4. explicit user confirmation
   5. `signAndBroadcast`, which refuses if step 4 or a live chain-ID check is missing
   6. wait for the receipt
3. **Real data only.**
   - Balances come from the RPC, history from Blockscout, prices from GeckoTerminal.
   - When data is missing the UI says so: there is no "$0", no fake chart and no estimated APY.
4. **Free by construction.**
   - There is no payment, subscription or gating code anywhere.
   - `apps/web/test/free-policy.test.ts` scans the whole monorepo to enforce this.
   - `INWIF_POLICY.serviceFeeBps = 0`.

## Web wallet storage

| Data | Where | Protection |
|---|---|---|
| Recovery phrase / private key | `localStorage` vault per wallet | PBKDF2-SHA256 (600k) → AES-256-GCM, WebCrypto |
| Decrypted secret | JS memory (`Map`) | cleared on lock / auto-lock / reload |
| Wallet names, addresses, settings | `localStorage` | public data |
| Notifications | `localStorage` | public data |

## Web server routes (optional relays)

| Route | Purpose | Guards |
|---|---|---|
| `/api/rpc/[network]` | JSON-RPC relay; with `DWELLIR_API_KEY` set, the primary browser path to Dwellir (key added server-side as `X-Api-Key`) with failover to public RPCs; `eth_getLogs` always uses public RPCs | method allow-list (reads + `eth_sendRawTransaction`), secret rejection, size and rate limits |
| `/api/explorer/[network]/…` | Blockscout v2 relay | path and query allow-list, cache, rate limit |
| `/api/market/*` | GeckoTerminal relay | parameter validation, cache, rate limit |

The desktop build is a static export without these routes. It calls the providers directly.

## Wallets only live in InWIF

InWIF does not connect to other websites or apps: there is no WalletConnect, injected provider or "Connect Wallet"
button. Every user gets a wallet created by InWIF on their own device, imports one (phrase or private key), watches
an address, or pairs an InWIF hardware device. Nothing outside InWIF can request a signature.

Creating a wallet takes one step: InWIF generates the BIP-39 phrase locally and encrypts it with the user's password.
The wallet is marked "not backed up" and the dashboard and Wallets page show a **Back up now** reminder
(`BackupModal`): the password decrypts the phrase, the words are revealed on request, and a three-word quiz
(`pickVerificationIndices` / `verifyBackupWords`) records the backup.

## Backend (`apps/api`)

This backend is optional and holds public data only. Sign-in works by EIP-191 signature over a
single-use nonce, and session tokens are stored only as SHA-256 hashes.

Endpoints:
- `GET /api/wallet/balances`
- `GET /api/wallet/transactions`
- `GET /api/token/wif`
- `GET /api/token/wif/utility`
- `GET /api/devices`
- `POST /api/devices/connect`
- `GET /api/security/alerts`
- auth: `/api/auth/challenge`, `/api/auth/verify`, `/api/me`

The schema is in `apps/api/migrations/001_init.sql`. It has no secret columns, and a test asserts that.

## Contracts

InWIF deploys no smart contracts. It interacts only with existing, verified contracts (ERC-20 tokens and the
Uniswap V3 deployment), and there is no subscription, membership, paid-access or purchase contract, by design.
