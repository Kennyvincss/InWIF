# Security model & threat analysis

## Assets
- User private keys and recovery phrases (critical)
- Transaction integrity: the user signs what they intended
- Privacy of the link between a user and their addresses

## Controls

| Threat | Control |
|---|---|
| Weak randomness | Platform CSPRNG via `@scure/bip39` / noble; expo-crypto on mobile; secure element TRNG (planned) |
| Custom-crypto bugs | Only established libraries: viem, @scure, noble, WebCrypto, RustCrypto `k256`, iqlusion `bip32`, OpenZeppelin |
| Key theft from storage | AES-256-GCM vault per wallet; PBKDF2 600k; OS keychain + biometrics on mobile; keys never leave hardware |
| Key leakage via network | No endpoint accepts secrets; relays and API reject secret-shaped payloads; logs redacted (`redact`) |
| Wrong / malicious RPC | `verifyNetwork` chain-ID check before every signature; signing disabled on mismatch |
| Blind signing | Decoded review, simulation (`eth_simulateV1` where supported, else revert check), risk findings |
| Unlimited approvals | Exact approvals by default; unlimited requires opt-in and is flagged high risk; revoke tooling; Permit2 allowances are exact and expire after 24 hours, and are decoded in the review |
| Bad swap price (dead or manipulated pool) | Every quote is compared with GeckoTerminal market prices: warning above 3% worse, swap blocked above 10%; best route across Uniswap V3 and V4 |
| Malicious V4 hook | V4 pools are routed only if listed after review; pool ID checked against its key before every quote; fee measured on-chain and shown; minimum output on every swap, so a hook taking more makes the swap revert |
| Address mistakes / poisoning | EIP-55 checksum, zero-address and token-contract checks, self-send warning, user blocklist |
| Malicious companion (hardware) | Device decodes and displays the tx itself; physical confirmation; chain allow-list |
| Counterfeit device | Challenge-response attestation against a vendor root; dev root is never reported as genuine |
| Malicious firmware | Firmware accepted only with a vendor signature over (version, image hash) |
| PIN brute force | On-device PIN, constant-time compare, wipe after 10 failures (secure element counter planned) |
| XSS / supply chain in web | CSP with `connect-src` limited to InWIF, the Robinhood Chain RPCs and the explorer; no third-party scripts; `frame-ancestors 'none'`; pinned lockfile; `pnpm audit` (inline scripts still allowed, see `security-review-2026-11.md`) |
| Skipped backup | The backup quiz requires every requested word; a wallet that was never backed up can be deleted only by typing DELETE |
| Phishing (secret pasted) | Recipient field detects pasted keys and phrases and blocks them |

## Known limitations (be honest with users)
- **Prototype simulator.** The browser device simulator is not secure hardware: its keys live in JS memory.
- **Dev firmware keys.** The firmware prototype keeps keys in MCU RAM. Production must use the secure element.
- **Compromised device.** A compromised computer or phone can still observe the user. Hardware signing reduces this risk but does not remove it.
- **No safety guarantee.** InWIF cannot detect every malicious contract. No warning does not mean safe.
- **No audit yet.** No independent audit has happened.

## Reporting vulnerabilities
See [../SECURITY.md](../SECURITY.md).
