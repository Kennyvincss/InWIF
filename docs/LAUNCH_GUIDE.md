# InWIF launch guide

This guide takes InWIF from today's state to fully functional. The live site is https://inwif.xyz (Vercel also still serves https://inwif.vercel.app), and the web
wallet works on Robinhood Chain mainnet.

Each step says who does what:
- **You:** things only you can do, such as creating accounts, paying for services, signing agreements or owning keys.
- **Claude:** code and configuration I can do once you give me what the step needs.

**Never paste a private key, recovery phrase or API key into a chat, issue or file.** When I need a key, I'll show
you a secure form, and the key goes straight into the environment without passing through the chat.

Recommended order:

| # | Step | Time | Cost |
|---|---|---|---|
| 1 | Dedicated RPC endpoint (Dwellir, integrated) | 5 min | free tier |
| 2 | Custom domain | 30 min | domain price |
| 3 | Shared rate limiting (Upstash Redis, integrated) | done | free tier |
| 4 | Backend API hosting | 30 min | free tiers |
| 5 | Mobile apps (iOS / Android) | days, mostly store review | $99/yr Apple, $25 Google |
| 6 | Desktop installers (Windows / macOS) | 1–2 h | signing certificates |
| 7 | Hardware wallet on a dev board | 1 day | about $15 of parts |
| 8 | Security audit | weeks | quote-based |
| 9 | Legal: privacy policy and terms | weeks | lawyer |
| — | Housekeeping | 5 min | — |

---

## 1. Dedicated RPC endpoint (Dwellir) — integrated

**Why.** The public Robinhood Chain RPC is free but rate-limited. InWIF supports **Dwellir** (archive node,
`api-robinhood-mainnet-archive.n.dwellir.com`) as a managed RPC for mainnet.

**How it works:**
- **The key stays on the server.** It is sent as an `X-Api-Key` header by the `/api/rpc` relay and the backend API.
  It is never in a URL and never in the browser bundle.
- **Traffic routing.** When the key is set, browsers send their RPC calls through `/api/rpc`. Reads go to Dwellir
  first, and any limit, plan or auth error fails over to the public RPCs automatically.
- **Log queries stay public.** `eth_getLogs` and filter calls always go to the public RPCs. Dwellir's Free plan has no
  `eth_getLogs`, and paid plans cap it at 500 or 10,000 blocks, far below InWIF's history scans.
- **Not covered:** the mobile and desktop apps (they have no server to hold
  the key) and local development all keep using public RPCs.

**You:**
1. Get a key at dashboard.dwellir.com.
2. Go to Vercel → project **inwif** → **Settings → Environment Variables** and add `DWELLIR_API_KEY` = your key for
   **Production** (and Preview if you want previews to use it). Do **not** add a `NEXT_PUBLIC_` prefix.
3. **Redeploy.** The build reads whether the key exists in order to send browser RPC through the relay. Only that
   yes/no flag reaches the browser, never the key.
4. If you host the backend API (step 4), set `DWELLIR_API_KEY` there too.

**Check:**
- `pnpm --filter @inwif/core verify:live` with the key set prints a "Managed RPC (Dwellir)" section.
- On the live site, responses from `/api/rpc` carry `x-inwif-upstream: managed`.

**Capacity.** The Free plan allows 20 responses per second and 100,000 per day, across all users. An active wallet
session makes roughly 10–15 reads a minute (polling balances and network checks). If you exceed the quota, the relay
falls back to the public RPCs, so the site keeps working.

## 2. Custom domain

**You:**
1. Buy a domain from a registrar such as Cloudflare, Namecheap or Porkbun.
2. Go to Vercel → **inwif → Settings → Domains → Add** and enter the domain.
3. Add the DNS records Vercel shows (usually an `A` record or a `CNAME`) at your registrar, then wait for Vercel to show
   **Valid Configuration**.
4. Change the Production variable `NEXT_PUBLIC_SITE_URL` to your domain (with or without `https://`), then redeploy.
   Share cards and the sitemap use it.
5. If you restricted your RPC key (step 1) by domain, add the new domain there too.

## 3. Shared rate limiting (Upstash Redis) — integrated

**Why.** The `/api` relays limit request rates per server instance. Under heavy traffic Vercel runs many instances, so
the limit needs one shared store.

**How it works:**
- **Rate limits** apply across all server instances. Each instance adds up usage locally and syncs it to Redis in
  batches, so most requests make no Redis call and the free tier's command quota lasts.
- **Relay responses** (explorer and market data) are cached in Redis, so one upstream call serves every instance.
- **If Redis is unreachable,** the site keeps working on per-instance limits and caches.
- The site accepts either variable naming from the Vercel integration: `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

**Check:** https://inwif.xyz/api/health shows `"sharedLimitsAndCache": "connected"`. If it says
`not configured`, make sure the variables are set for **Production** and redeploy.

**Usage:** watch the command count in the Upstash console. If the free tier runs out, the site falls back to
per-instance limits; upgrade the Upstash plan if that happens often.

## 4. Backend API hosting (`apps/api`)

**Why.** The website works without it. The backend adds:
- sign-in with a wallet signature
- a server-side device registry
- a public-data API for other apps

**You:**
1. Create a PostgreSQL database on a free tier (Neon or Supabase) and copy its connection string.
2. Create a web service on Render, Railway or Fly.io, from the GitHub repo, with:
   - **Build:** `pnpm install --frozen-lockfile --filter @inwif/api...`
   - **Start:** `pnpm --filter @inwif/api start`. Migrations run automatically at start-up.
   - **Environment variables:**
     - `DATABASE_URL` = the connection string, kept secret in the host's dashboard
     - `CORS_ORIGINS` = `https://inwif.xyz` (plus `https://inwif.vercel.app` while both are in use)
     - `REDIS_URL` (optional)
3. Check that `https://<your-api-host>/api/health` returns `"free": true`.

**Claude:** connect the website to it: wallet sign-in and device sync.

## 5. Mobile apps (iOS and Android)

**You: accounts**
1. **Apple Developer Program** ($99/year). Apple's App Store rules only allow cryptocurrency wallet apps from
   developers enrolled **as an organization**, not as an individual. Enrolling as an organization requires a legal
   entity and a D-U-N-S number, which is free from Dun & Bradstreet but can take days.
2. **Google Play Console** ($25 one-time). Complete Google's financial-services and crypto declarations. Requirements
   differ by country.
3. Both stores require a **privacy policy URL** (step 9), screenshots and a description.

**You and Claude: build and submit with Expo EAS**

```bash
npm i -g eas-cli
cd apps/mobile
eas login
eas build:configure
eas build -p android     # then: eas submit -p android
eas build -p ios         # then: eas submit -p ios
```

**Claude:** add `eas.json`, app icons, a splash screen and store screenshots, and extend the mobile app with swaps,
activity and the Security Centre so it matches the web wallet.

## 6. Desktop installers (Windows and macOS)

**You:**
1. **macOS:** a "Developer ID Application" certificate, included with the Apple Developer account from step 5. Also
   create an app-specific password for notarisation.
2. **Windows:** a code-signing certificate. Azure Trusted Signing is the cheapest; an OV or EV certificate from a
   certificate authority also works. Without one, Windows shows "unknown publisher" warnings.
3. Add the certificates as **GitHub repository secrets**, under Settings → Secrets and variables → Actions. I'll tell
   you the exact secret names.

**Claude:** add a GitHub Actions release workflow (`tauri-action`) that builds signed `.msi`/`.exe` and notarised `.dmg`
files on GitHub's Windows and macOS machines and attaches them to a GitHub Release.

## 7. Hardware wallet on a development board

**You: buy parts (about $15)**
- Raspberry Pi Pico (RP2040) with pre-soldered headers
- a 0.96" or 1.3" SSD1306 I²C OLED display (128×64)
- 2 push buttons, a breadboard and jumper wires
- a USB cable

**Claude:**
1. Write the board firmware (Rust, `embassy-rp`): display and button drivers plus a USB-serial loop around the
   existing `firmware` core, with a wiring diagram.
2. You flash it by holding **BOOTSEL**, plugging the Pico in and dragging the `.uf2` file onto it.
3. Connect it in the InWIF desktop app or in Chrome (**Hardware → Connect over USB-C**). It speaks the same protocol as
   the simulator.

**This board is still a development device. It keeps keys in ordinary chip memory, not a secure element.**

**Later stages (production device):**

| Stage | Who |
|---|---|
| Secure element evaluation: Infineon OPTIGA Trust M, NXP SE050 or Microchip ATECC608B dev kits | you buy kits; Claude writes drivers |
| Custom circuit board and enclosure | an electronics engineer or design firm |
| Production vendor signing key in a hardware security module (e.g. YubiHSM 2, AWS CloudHSM) | you own it |
| Independent hardware security testing (fault injection, side channels) | a specialist lab |
| Manufacturing and factory attestation provisioning | a manufacturing partner |

## 8. Security audit

**You:**
1. **Wallet application** (key handling, signing flow, hardware protocol, web security). Get quotes from an application
   security firm such as Cure53, NCC Group or Trail of Bits. InWIF deploys no smart contracts of its own, so there is
   no contract audit to commission.
2. After launch, start a **bug bounty** (e.g. on Immunefi).

**Claude:** prepare the audit package (scope, threat model, architecture, test instructions, known limitations) and fix
the findings.

## 9. Legal: privacy policy and terms

**You:**
1. Talk to a lawyer experienced in crypto and consumer software where you operate. Non-custodial wallets are treated
   differently from exchanges in most places, but the rules vary, and app stores require proper policies.
2. Consider forming a legal entity. Apple requires one for wallet apps (step 5).
3. Give me the approved texts.

**Claude:** publish them on the site, link them from the footer and the stores, and keep the privacy policy in line
with what the app actually sends to third parties: the RPC provider, Blockscout, GeckoTerminal and Vercel.

## Housekeeping

- **Vercel CLI login.** The device login used for the first deploy may have left an access token on your Vercel
  account. Revoke any you don't recognise under Vercel → Account Settings → Tokens. Future deploys happen automatically
  from GitHub.
- **Branch protection.** Under GitHub → Settings → Branches, protect `main` and require the **CI** check, so broken
  builds can't be merged.
- **$WIF governance.** If the World Is Flat community launches on-chain governance, share the contract and docs.
  InWIF won't claim voting rights that don't exist.
