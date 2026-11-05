/**
 * Build a reward campaign from a CSV of `address,amount` rows (amounts in whole tokens).
 *
 *   pnpm --filter @inwif/core rewards:build <allocations.csv> <out.json> [campaignId=1] [decimals=18]
 *
 * Writes the claims file the web app reads ({ claims: { address: { amount, proof } } }) and prints
 * the Merkle root and total (base units) for SetupTestnetRewards / createCampaign.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { getAddress, isAddress, parseUnits } from 'viem'
import { buildCampaignTree, proofFor } from '../src'

const [csvPath, outPath, idArg = '1', decArg = '18'] = process.argv.slice(2)
if (!csvPath || !outPath) {
  console.error('usage: rewards:build <allocations.csv> <out.json> [campaignId] [decimals]')
  process.exit(1)
}
const campaignId = BigInt(idArg)
const decimals = Number(decArg)

const rows = readFileSync(csvPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && !/^address\s*,/i.test(l))

const allocations = rows.map((line, i) => {
  const [addr, amt] = line.split(',').map((x) => x?.trim() ?? '')
  if (!addr || !isAddress(addr, { strict: false })) throw new Error(`row ${i + 1}: invalid address "${addr}"`)
  if (!amt || !/^\d+(\.\d+)?$/.test(amt)) throw new Error(`row ${i + 1}: invalid amount "${amt}"`)
  return { account: getAddress(addr), amount: parseUnits(amt, decimals) }
})
if (!allocations.length) throw new Error('no allocations found')

const tree = buildCampaignTree(campaignId, allocations)
const claims: Record<string, { amount: string; proof: string[] }> = {}
for (const a of allocations) {
  const p = proofFor(tree, a.account)!
  claims[a.account] = { amount: p.amount.toString(), proof: p.proof }
}
const out = { campaignId: campaignId.toString(), root: tree.root, total: tree.total.toString(), decimals, recipients: allocations.length, claims }
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify({ root: tree.root, total: tree.total.toString(), recipients: allocations.length, out: outPath }))
