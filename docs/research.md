# Research & verification notes (2026-11-04)

## 1. Reference product (Unruggable)
The development environment's network policy blocked `unruggable.io`, so its site could not be studied directly
during this build. InWIF's feature set was derived from the brief's description of that product category:
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

**Runtime check.** The chain RPC itself was not reachable from the build sandbox. To compensate, the wallet checks
`eth_chainId` against the RPC at runtime and **refuses to sign on mismatch**. This was exercised end-to-end against
a local chain.

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
  (`compareMetadata`); any mismatch is shown to the user. They could not be read from the sandbox because the RPC was blocked.
- **No invented governance.** No on-chain $WIF governance contract was found, so InWIF invents no governance rights.

## 5. Other tokens listed by default
USDG `0x5fc5…d168` (6 dec) and cbBTC `0xCEC1…0Be4` (8 dec) come from the Uniswap default token list for chain 4663.
