/**
 * Pre-signing simulation.
 *
 * 1. `eth_call` + `eth_estimateGas` against the latest block — detects reverts.
 * 2. Where the node supports `eth_simulateV1`, viem's `simulateCalls` is used to
 *    obtain native and ERC-20 balance changes.
 *
 * Results are labelled with which method succeeded; when only the revert check
 * is available, the UI says so rather than implying a full simulation.
 */
import { formatUnits, type Address, type Hex, type PublicClient } from 'viem'

export interface AssetChange {
  token: Address | 'native'
  symbol: string
  decimals: number
  diff: bigint
}

export interface SimulationResult {
  method: 'simulateV1' | 'eth_call' | 'none'
  success: boolean
  revertReason?: string
  gasEstimate?: bigint
  assetChanges: AssetChange[]
  notes: string[]
}

export interface SimRequest {
  from: Address
  to?: Address
  value?: bigint
  data?: Hex
}

export async function simulateTransaction(
  client: PublicClient,
  req: SimRequest,
  watchTokens: Address[] = [],
): Promise<SimulationResult> {
  const notes: string[] = []
  let gasEstimate: bigint | undefined
  try {
    await client.call({ account: req.from, to: req.to, value: req.value, data: req.data })
    gasEstimate = await client.estimateGas({ account: req.from, to: req.to, value: req.value, data: req.data })
  } catch (e) {
    const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message
    return { method: 'eth_call', success: false, revertReason: msg, assetChanges: [], notes: ['Transaction would revert at the current block.'] }
  }

  if (req.to) {
    try {
      const res = await client.simulateCalls({
        account: req.from,
        calls: [{ to: req.to, value: req.value, data: req.data }],
        traceAssetChanges: true,
      } as Parameters<PublicClient['simulateCalls']>[0])
      const assetChanges: AssetChange[] = (res.assetChanges ?? []).map((c) => ({
        token: c.token.address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? 'native' : c.token.address,
        symbol: c.token.symbol ?? '?',
        decimals: c.token.decimals ?? 18,
        diff: c.value.diff,
      }))
      void watchTokens
      return { method: 'simulateV1', success: true, gasEstimate, assetChanges, notes }
    } catch {
      notes.push('This RPC does not support full simulation (eth_simulateV1); only a revert check was performed.')
    }
  }
  return { method: 'eth_call', success: true, gasEstimate, assetChanges: [], notes }
}

export function describeChange(c: AssetChange): string {
  const sign = c.diff > 0n ? '+' : c.diff < 0n ? '−' : ''
  const abs = c.diff < 0n ? -c.diff : c.diff
  return `${sign}${formatUnits(abs, c.decimals)} ${c.symbol}`
}

export interface FeeEstimate {
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  /** Upper bound the user may pay, in wei. */
  maxFeeWei: bigint
  /** Likely cost at current base fee, in wei. */
  expectedFeeWei: bigint
}

/** Estimate EIP-1559 fees with a 20% gas buffer. All values come from the live RPC. */
export async function estimateFees(client: PublicClient, req: SimRequest): Promise<FeeEstimate> {
  const [gasRaw, fees, block] = await Promise.all([
    client.estimateGas({ account: req.from, to: req.to, value: req.value, data: req.data }),
    client.estimateFeesPerGas(),
    client.getBlock(),
  ])
  const gas = (gasRaw * 120n) / 100n
  const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n
  const base = block.baseFeePerGas ?? maxFeePerGas
  return {
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    maxFeeWei: gas * maxFeePerGas,
    expectedFeeWei: gasRaw * (base + maxPriorityFeePerGas),
  }
}
