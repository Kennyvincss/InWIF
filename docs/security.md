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
| Unlimited approvals | Exact approvals by default; unlimited requires opt-in and is flagged high risk; revoke tooling |
| Address mistakes / poisoning | EIP-55 checksum, zero-address and token-contract checks, self-send warning, user blocklist |
| Malicious companion (hardware) | Device decodes and displays the tx itself; physical confirmation; chain allow-list |
| Counterfeit device | Challenge-response attestation against a vendor root; dev root is never reported as genuine |
| Malicious firmware | Firmware accepted only with a vendor signature over (version, image hash) |
| PIN brute force | On-device PIN, constant-time compare, wipe after 10 failures (secure element counter planned) |
| XSS / supply chain in web | Strict CSP, no third-party scripts, `frame-ancestors 'none'`, pinned lockfile |
| Phishing (secret pasted) | Recipient field detects pasted keys and phrases and blocks them |
| Malicious dApp (WalletConnect) | Verify API domain check shown on every request, known scams blocked, only the active account shared, every request reviewed in InWIF, sessions revocable |
| Permit / off-chain signature phishing | EIP-2612 and Permit2 decoded and flagged high risk (UNLIMITED highlighted), extra confirmation required; hash-like `personal_sign` payloads and mismatched sign-in domains flagged |

## Known limitations (be honest with users)
- **Prototype simulator.** The browser device simulator is not secure hardware: its keys live in JS memory.
- **Dev firmware keys.** The firmware prototype keeps keys in MCU RAM. Production must use the secure element.
- **Compromised device.** A compromised computer or phone can still observe the user. Hardware signing reduces this risk but does not remove it.
- **No safety guarantee.** InWIF cannot detect every malicious contract. No warning does not mean safe.
- **No audit yet.** No independent audit has happened.

## Reporting vulnerabilities
See [../SECURITY.md](../SECURITY.md).
