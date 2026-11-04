/**
 * Live verification against Robinhood Chain mainnet (read-only, no keys).
 *   pnpm --filter @inwif/core verify:live
 * (Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 so Node's fetch uses it.)
 * Checks every network parameter and contract address InWIF relies on.
 */
import { parseEther, type Address } from 'viem'
import {
  DEFAULT_TOKENS,
  NATIVE,
  ROBINHOOD_MAINNET as N,
  ROBINHOOD_TESTNET,
  WIF_ADDRESS,
  compareMetadata,
  fetchExplorerToken,
  fetchTokenMarket,
  fetchTokenTransfers,
  getBestQuote,
  getPublicClient,
  readTokenMetadata,
  verifyNetwork,
  verifyUniswapDeployment,
} from '../src'

let failures = 0
const ok = (m: string) => console.log(`  ✓ ${m}`)
const bad = (m: string) => {
  failures++
  console.log(`  ✗ ${m}`)
}

const client = getPublicClient(N)

console.log('Network')
for (const n of [N, ROBINHOOD_TESTNET]) {
  const v = await verifyNetwork(n, getPublicClient(n))
  v.ok ? ok(`${n.name}: chain ${v.chainId}, block ${v.blockNumber}`) : bad(`${n.name}: ${v.reason}`)
}

console.log('Tokens (on-chain metadata vs listing)')
for (const t of DEFAULT_TOKENS.robinhood) {
  try {
    const m = await readTokenMetadata(client, t.address)
    const c = compareMetadata(t, m)
    const supply = Number(m.totalSupply / 10n ** BigInt(m.decimals)).toLocaleString()
    c.matches ? ok(`${m.symbol} "${m.name}" ${m.decimals} dec, supply ${supply} @ ${t.address}`) : bad(`${t.symbol}: ${c.issues.join(' ')}`)
  } catch (e) {
    bad(`${t.symbol}: ${(e as Error).message.split('\n')[0]}`)
  }
}

console.log('Uniswap V3')
const dep = await verifyUniswapDeployment(client, N.uniswapV3!)
for (const c of dep.contracts) (c.deployed ? ok : bad)(`${c.name} ${c.address} ${c.deployed ? 'has code' : 'NO CODE'}`)
const npmCode = await client.getCode({ address: N.uniswapV3!.nonfungiblePositionManager })
;(npmCode && npmCode !== '0x' ? ok : bad)(`nonfungiblePositionManager ${N.uniswapV3!.nonfungiblePositionManager}`)
try {
  const q = await getBestQuote(client, N.uniswapV3!, NATIVE, WIF_ADDRESS, parseEther('0.01'))
  ok(`quote 0.01 ETH → ${(Number(q.amountOut) / 1e18).toLocaleString()} WIF via ${q.route}, impact ${q.priceImpact !== null ? (q.priceImpact * 100).toFixed(3) + '%' : 'n/a'}`)
} catch (e) {
  bad(`quote ETH→WIF: ${(e as Error).message.split('\n')[0]}`)
}

console.log('Explorer (Blockscout v2)')
try {
  const t = await fetchExplorerToken(N, WIF_ADDRESS)
  ok(`WIF on Blockscout: ${t.name} (${t.symbol}), holders ${t.holders}`)
  const tr = await fetchTokenTransfers(N, '0x0000000000000000000000000000000000000001' as Address, {})
  ok(`token-transfers endpoint responds (${tr.items.length} items for a test address)`)
} catch (e) {
  const m = (e as Error).message
  if (/Cloudflare/.test(m)) console.log(`  ! explorer reachable but ${m} from this server; browsers query it directly`)
  else bad(`explorer: ${m}`)
}

console.log('Market data (GeckoTerminal)')
try {
  const m = await fetchTokenMarket('robinhood', WIF_ADDRESS)
  m ? ok(`WIF price $${m.priceUsd}, liquidity $${Math.round(m.liquidityUsd ?? 0).toLocaleString()}, top pool ${m.topPool}`) : bad('WIF has no GeckoTerminal market')
} catch (e) {
  bad(`geckoterminal: ${(e as Error).message}`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll live checks passed')
process.exit(failures ? 1 : 0)
