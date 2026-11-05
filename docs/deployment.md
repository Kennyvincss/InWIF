# Deployment

## Vercel (recommended for the website + web wallet)

1. On vercel.com choose **Add New… → Project**, then **Import** the `Kennyvincss/InWIF` GitHub repository.
2. Set **Root Directory** to `apps/web`. Leave "Include files outside the root directory" enabled, because the app imports
   `packages/core`. Vercel detects Next.js and pnpm. `apps/web/vercel.json` sets the install and build commands.
3. **Environment variables:** none are required. For a managed RPC, set `DWELLIR_API_KEY` (server-side only; see
   LAUNCH_GUIDE step 1). Reads then go through Dwellir with automatic failover to the public RPCs.
4. Deploy.
   - **Production** deploys build from the repository's default branch (`main`).
   - **Other branches**, such as `claude/chat-session-kr64hi`, get Preview URLs.

The `/api/*` relays run as Vercel Functions. Each instance rate-limits in memory, which is adequate for a demo; use a
shared store such as Upstash Redis for heavy production traffic. Security headers and the CSP come from
`next.config.mjs`.

## Web wallet + landing (`apps/web`) on any Node host
```bash
pnpm install
pnpm --filter @inwif/web build
pnpm --filter @inwif/web start            # or deploy to any Node host (Vercel, Fly, Docker)
```

Optional env vars (see `apps/web/.env.example`):

| Variable | Default / purpose |
|---|---|
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | default: public RPC |
| `NEXT_PUBLIC_ENABLE_LOCAL_NETWORK=true` | adds the Anvil network for development |

Security headers and CSP are set in `next.config.mjs`. Behind a load balancer, replace the in-memory rate limiter
in `src/server/guard.ts` with a shared one.

## Backend (`apps/api`)
```bash
cp apps/api/.env.example apps/api/.env     # DATABASE_URL, CORS_ORIGINS, optional REDIS_URL
pnpm --filter @inwif/api migrate
pnpm --filter @inwif/api start            # :4000
```


## Desktop (`apps/desktop`)
Prerequisites:
- Rust
- Tauri 2 system dependencies (Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev libudev-dev`)

```bash
pnpm --filter @inwif/desktop build        # runs the web desktop export, then bundles
```

- **Windows** (`.msi` / `.exe`) and **macOS** (`.dmg`) bundles must be built on those operating systems.
- **macOS** also needs an Apple Developer ID for signing and notarisation; **Windows** needs an Authenticode certificate.

## Mobile (`apps/mobile`)
```bash
cd apps/mobile
npx expo run:ios       # requires Xcode
npx expo run:android   # requires the Android SDK
```

Store releases need:
- Apple Developer and Google Play accounts
- EAS or local signing credentials
