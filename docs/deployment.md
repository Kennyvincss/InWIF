# Deployment

## Web wallet + landing (`apps/web`)
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
| `NEXT_PUBLIC_REWARDS_ADDRESS_46630` / `_31337` | deployed rewards contract (testnet / local) |

Security headers and CSP are set in `next.config.mjs`. Behind a load balancer, replace the in-memory rate limiter
in `src/server/guard.ts` with a shared one.

## Backend (`apps/api`)
```bash
cp apps/api/.env.example apps/api/.env     # DATABASE_URL, CORS_ORIGINS, optional REDIS_URL
pnpm --filter @inwif/api migrate
pnpm --filter @inwif/api start            # :4000
```

## Rewards contract (testnet only)
```bash
cd contracts
forge test
forge script script/DeployRewards.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com/rpc \
  --broadcast --account <foundry-keystore> --sig "run(address)" <adminAddress>
```

- The script reverts on chain 4663.
- Mainnet deployment requires an independent audit first.
- Use a hardware wallet or multisig as admin.

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
