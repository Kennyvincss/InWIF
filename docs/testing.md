# Testing

| Suite | Command | What it covers |
|---|---|---|
| Core (vitest) | `pnpm --filter @inwif/core test` | mnemonic vectors, keystore round-trip and tamper detection, validation, risk review, swap calldata (no InWIF fee), Merkle trees, Blockscout parsing, network verification fail-closed, signing guards, hardware protocol and simulator (PIN wipe, rejection, chain allow-list, attestation, firmware signatures) |
| Web (vitest) | `pnpm --filter @inwif/web test` | formatting never invents values; **free-policy guardrail** scanning the monorepo for paywall / subscription / payment code |
| Web E2E (Playwright) | `node apps/web/e2e/smoke.mjs` | real browser against a local Anvil chain (see below) |
| API (vitest + PostgreSQL) | `pnpm --filter @inwif/api test` | wallet-signature auth, nonce replay, secret rejection, device registry, input validation, rate limiting, no payment endpoints, schema has no secret columns |
| Contracts (Foundry) | `cd contracts && forge test` | unit, fuzz (512 runs) and invariant tests: solvency, conservation, claimed ≤ funded; TS-generated Merkle proofs verify on-chain; mainnet deploy refused |
| Firmware (cargo) | `cd firmware && cargo test` | byte-identical signatures vs the TS implementation, RLP and tx parser hardening, PIN wipe, chain allow-list, attestation, firmware signature checks |
| Live mainnet (read-only) | `NODE_USE_ENV_PROXY=1 pnpm --filter @inwif/core verify:live` | chain IDs, $WIF and token metadata, Uniswap deployments, a live quote, explorer and market reachability |
| Live web (read-only) | `node apps/web/e2e/live-mainnet.mjs` (server on :3000) | watch-only wallet on mainnet: verification, live portfolio, charts, $WIF page, swap quote, activity (with RPC fallback) |
| Mobile | `cd apps/mobile && npx tsc --noEmit && npx expo export --platform android` | type safety and bundling |
| Desktop | `cd apps/desktop/src-tauri && cargo build` | native shell compiles |

The web E2E test performs these steps in a real browser:
1. create a wallet (with the backup quiz) and verify the chain ID
2. check the recovery phrase is not stored in plaintext
3. send ETH with the software signer and confirm the receipt on-chain
4. render every wallet page
5. run the hardware simulator: restore it, check authenticity, add its accounts, send with on-device approval (confirmed on-chain) and test on-device rejection
6. check the mobile layout

Prerequisites for the E2E test:

```bash
anvil --chain-id 31337 &
cd apps/web && NEXT_PUBLIC_ENABLE_LOCAL_NETWORK=true pnpm build && pnpm start &
node e2e/smoke.mjs
```

The API tests need PostgreSQL. Set `TEST_DATABASE_URL`; the default is `postgres://inwif:inwif-dev@127.0.0.1:5432/inwif_test`.

`NODE_USE_ENV_PROXY=1` is only needed where outbound traffic goes through an HTTPS proxy, as in the sandbox used to build this.

## Not yet done
- No independent security audit has been performed.
- No testing on physical hardware (no device exists yet).
- No native iOS / Android device testing.
