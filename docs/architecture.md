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
            │  defi · rewards · signer · redact        │
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
| `/api/rpc/[network]` | JSON-RPC fallback for RPCs without CORS | method allow-list (reads + `eth_sendRawTransaction`), secret rejection, size and rate limits |
| `/api/explorer/[network]/…` | Blockscout v2 relay | path and query allow-list, cache, rate limit |
| `/api/market/*` | GeckoTerminal relay | parameter validation, cache, rate limit |

The desktop build is a static export without these routes. It calls the providers directly.

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
- `GET /api/rewards`
- auth: `/api/auth/challenge`, `/api/auth/verify`, `/api/me`

The schema is in `apps/api/migrations/001_init.sql`. It has no secret columns, and a test asserts that.

## Contracts

`InWIFRewards` handles optional, Merkle-committed reward campaigns, paid only from deposits that
already exist on-chain. There is no subscription, membership, paid-access or purchase contract,
by design.
