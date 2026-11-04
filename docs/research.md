# Research & verification notes (2026-11-04)

## 0. Live verification results (mainnet, 2026-11-04)
Run `pnpm --filter @inwif/core verify:live` to repeat these checks. They are read-only and need no keys.

| Check | Result |
|---|---|
| `eth_chainId` mainnet / testnet | **4663** / **46630**, matching config |
| $WIF `0x5173…4773` | name **"World is Flat"**, symbol **WIF**, **18** decimals, total supply **999,997,640.6** (on-chain) |
| WETH / USDG / cbBTC | on-chain symbol and decimals match the listings (18 / 6 / 8) |
| Uniswap V3 factory, QuoterV2, SwapRouter02, WETH9, NonfungiblePositionManager | deployed code present at every address |
| Live quote | 0.01 ETH → ~12,773 WIF via the 1% pool (~2.9% price impact at that size) |
| GeckoTerminal | WIF ≈ $0.00164, liquidity ≈ $64k; top pool id is a 32-byte (v4-style) id, which is supported |
| Blockscout mainnet API | reachable, but sits behind a Cloudflare bot challenge for server and data-centre IPs (see below) |

The web wallet was also exercised live (`apps/web/e2e/live-mainnet.mjs`) with a watch-only wallet for the public
Uniswap V3 WIF/WETH pool. It showed:
- verified chain 4663
- 9,363,133 WIF ≈ $15.4k from live balances and prices
- real price charts
- verified $WIF metadata
- a live swap quote
- 25 real transfers in the activity view

**Explorer resilience.** Because the Blockscout API may challenge some clients, the wallet:
1. calls Blockscout directly from the user's browser
2. falls back to the InWIF relay
3. finally falls back to recent ERC-20 transfers read straight from chain logs (`fetchTokenTransfersViaRpc`), labelled as such in the UI

**Market data limits.** GeckoTerminal's free API allows about 30 requests a minute. The relay paces calls, retries one 429,
and serves the last good response for up to an hour. When the provider is limiting, the UI says so; it never
shows fabricated values.


## 1. Reference product (Unruggable)
`unruggable.io` was blocked by the environment's network policy during the initial build and was allowed later. InWIF's feature set was derived from the brief's description of that product category:
- a hardware wallet with a secure display and physical confirmation
- a companion app covering portfolio, swaps and transaction security

All code, branding, protocol (IWDP) and design are original to InWIF. Nothing was copied.

## 2. Robinhood Chain parameters

| Parameter | Value | Source |
|---|---|---|
| Mainnet chain ID | 4663 | ethereum-lists/chains `eip155-4663.json` |
| Testnet chain ID | 46630 | ethereum-lists/chains `eip155-46630.json` |
| Gas token | ETH (18 dec) | same; Uniswap interface chain info |
| Mainnet RPC | `https://rpc.mainnet.chain.robinhood.com` (+ publicnode fallback) | same |
| Testnet RPC | `https://rpc.testnet.chain.robinhood.com/rpc` | same |
| Explorer | `https://robinhoodchain.blockscout.com` (Blockscout v2 API) | same; Uniswap interface |
| Stack | Arbitrum Orbit L2 settling to Ethereum | registry `parent` + Arbitrum bridge |
| Official docs | `https://docs.robinhood.com/chain` | registry `infoURL` (not reachable from the build sandbox) |

**Runtime check.** The wallet also checks `eth_chainId` against the RPC at runtime and **refuses to sign on mismatch**
(verified live, see section 0).

## 3. Uniswap on Robinhood Chain (from Uniswap's own SDK source)

| Contract | Address |
|---|---|
| V3 Factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
| QuoterV2 | `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` |
| SwapRouter02 | `0xcaf681a66d020601342297493863e78c959e5cb2` |
| NonfungiblePositionManager | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| WETH9 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

Sources: `Uniswap/sdks` (`sdk-core/src/addresses.ts`, `entities/weth9.ts`) and `Uniswap/interface` (chain info).
The swap screen verifies that each address has deployed code before quoting.

## 4. $WIF
- **Contract:** `0x5173b8eA6923c2d40267890D45C46a3480954773`, as given in the brief. Public explorer and GeckoTerminal listings index
  it as "World is Flat (WIF)" on Robinhood Chain, with WIF/WETH pools on Uniswap V3.
- **Metadata is read live.** Name, symbol, decimals and total supply are read from the contract at runtime and compared with the listing
  (`compareMetadata`); any mismatch is shown to the user. Verified values are in section 0.
- **No invented governance.** No on-chain $WIF governance contract was found, so InWIF invents no governance rights.

## 5. Other tokens listed by default
USDG `0x5fc5…d168` (6 dec) and cbBTC `0xCEC1…0Be4` (8 dec) come from the Uniswap default token list for chain 4663.
