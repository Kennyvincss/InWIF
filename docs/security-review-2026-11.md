# InWIF internal security review: November 2026

**This is an internal review, not an independent audit.** It was done by the same AI assistant that wrote
most of the code, so it cannot replace a review by an outside security firm. The wallet keeps its
"pre-release, not audited" label until an independent audit is published. This review is meant to fix
what can be fixed now and to make that audit faster.

Scope: `packages/core` (keys, signing, review, swaps), `apps/web` (wallet UI, server relays, headers),
`apps/api` (sign-in), `apps/mobile` (secret storage), and production dependencies. Out of scope:
firmware and hardware, the desktop shell, and third-party contracts (Uniswap, Pons).

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Backup quiz could be skipped: blank or partial answers passed | High | Fixed |
| 2 | Vulnerable dependencies: zod (API memory exhaustion), postcss (build-time) | High | Fixed |
| 3 | RPC relay refused transaction hashes and log topics as "secret-shaped" | Medium | Fixed |
| 4 | RPC relay rate limit counted a 20-call batch as one request | Medium | Fixed |
| 5 | Browser could connect to any HTTPS host (`connect-src https: wss:`) | Medium | Fixed |
| 6 | Inline scripts allowed by the CSP (`script-src 'unsafe-inline'`) | Medium | Open: for the audit |
| 7 | Rate limiter reset every client once 10,000 addresses were tracked | Low | Fixed |
| 8 | Deleting a wallet that was never backed up needed only one click to confirm | Low | Fixed |
| 9 | API sign-in message is not bound to a domain (EIP-4361) | Low | Open: API not deployed |
| 10 | Two moderate advisories in Expo's command-line tools (glob, minimatch) | Info | Open: dev tooling only |

## Findings

**1. Backup quiz could be skipped (High, fixed).** `verifyBackupWords` checked only the answers that were
given, so clicking Verify with all three fields empty (or one filled) marked the wallet as backed up.
The "Back up now" reminder then disappeared for a wallet whose phrase the user may never have written
down. Now every quiz position must be answered correctly; empty answers never pass. Fixed on web and
mobile, with tests (`packages/core/test/wallet.test.ts`).

**2. Vulnerable dependencies (High, fixed).** `zod` 3.x in the API is affected by a memory-exhaustion
advisory for oversized inputs; upgraded to 4.6.7 (API tests pass). Next.js bundled `postcss` with
advisories that affect build-time CSS processing; pinned to 8.5.32 with a pnpm override.

**3. Relay refused 32-byte hex values (Medium, fixed).** The relay rejected any 64-hex-character
string as a possible private key. Transaction hashes, log topics and storage slots have the same
shape, so `eth_getTransactionReceipt`, `eth_getTransactionByHash` and history queries sent through the
relay (the first route in production, so Dwellir is used) failed and silently fell back to public
RPCs; if those failed too, the Activity page showed an error. The relay now accepts 32-byte hex in
RPC params and still refuses recovery phrases and key-named fields. The API keeps the strict check.

**4. Batch rate limiting (Medium, fixed).** Each JSON-RPC call in a batch now counts against the
600-per-minute limit, which caps how fast one client can use the Dwellir quota.

**5. Unrestricted `connect-src` (Medium, fixed).** The browser may now connect only to InWIF itself,
the Robinhood Chain RPCs and the explorer. The local-node entries appear only in local builds. A test
keeps the list in sync with the network config. Checked on every wallet page against mainnet: no
blocked requests, and a fetch to an unknown host is refused.

**6. Inline scripts (Medium, open).** Next.js needs inline scripts unless pages are rendered with a
per-request nonce, which turns static pages dynamic. If an XSS bug were ever introduced, inline script
could read an unlocked session. Mitigations in place: no `dangerouslySetInnerHTML` or `eval`, React
escaping, no third-party scripts, the restricted `connect-src` above, and auto-lock. Recommended for the
audit: move to a nonce-based CSP.

**7. Rate-limiter reset (Low, fixed).** The in-memory limiter cleared every bucket once it tracked
10,000 addresses. It now evicts the least recently seen clients instead.

**8. Deleting an unbacked-up wallet (Low, fixed).** Deleting a recovery-phrase wallet that was never
backed up now explains that nobody can recover it and requires typing DELETE.

**9. Sign-in message not domain-bound (Low, open).** A phishing site could relay the API's sign-in
challenge. Impact is low because the session only covers public device metadata and the API is not
deployed. Recommended before deploying the API: an EIP-4361 message with domain and URI.

**10. Dev tooling advisories (Info).** `glob` and `minimatch` inside Expo's CLI are only used when
building the mobile app, not by users.

## Checked and found sound

- **Key storage:** WebCrypto PBKDF2-SHA256 (600,000 iterations) to AES-256-GCM, a random salt and IV
  per wallet, a separate vault per wallet, and the password re-checked before the phrase is revealed.
  Decrypted secrets are held in memory only, cleared on lock, auto-lock (1–60 minutes) and reload.
- **Key generation:** BIP-39 and BIP-32 from @scure; the quiz positions come from the platform CSPRNG
  with rejection sampling; private-key import rejects the zero key and values at or above the curve order.
- **Signing gate:** signing requires a live chain-ID check (repeated right before signing), a
  successful simulation, the user's explicit confirmation, and no blocking findings. A hardware
  device must hold the account's address.
- **Transaction review:** ERC-20 and Permit2 approvals are decoded, unlimited amounts are flagged,
  unknown contracts and spenders are warned about, and swaps carry a minimum output plus the
  market-price guard.
- **Server relays:** only listed RPC methods are allowed; the explorer relay accepts only fixed path
  patterns and query keys (no SSRF); request size and batch limits apply; the Dwellir key is sent
  server-side as a header and is never in the browser bundle (checked on the live site).
- **Headers:** HSTS with preload, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  `no-referrer`, COOP, and camera and microphone disabled.
- **API:** single-use expiring nonces (claimed atomically), only SHA-256 hashes of session tokens
  stored, rate limiting, and secret-shaped payloads rejected.
- **Mobile:** secrets in the OS keychain with `requireAuthentication` (biometrics).
- **Code patterns:** no `dangerouslySetInnerHTML`, `eval` or `new Function`; no console logging of
  request data.

## What the independent audit should cover

1. The key-handling code above (`keystore.ts`, `mnemonic.ts`, `signer.ts`, `wallet-store.tsx`).
2. Transaction review and swap calldata (`risk.ts`, `swap.ts`, `swap-v4.ts`).
3. A nonce-based CSP (finding 6) and a penetration test of the web app and relays.
4. Firmware and the hardware protocol, before any device is sold.
