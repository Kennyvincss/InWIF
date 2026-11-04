/**
 * Token approval discovery and revocation.
 *
 * Approvals are discovered from on-chain `Approval(owner, spender, value)` logs
 * for the given tokens, then the *current* allowance is read for each unique
 * spender so that only live approvals are shown.
 */
import { encodeFunctionData, erc20Abi, getAddress, parseAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import { UNLIMITED_THRESHOLD } from './risk'

const approvalEvent = parseAbiItem('event Approval(address indexed owner, address indexed spender, uint256 value)')

export interface LiveApproval {
  token: Address
  spender: Address
  allowance: bigint
  unlimited: boolean
}

export async function findApprovals(
  client: PublicClient,
  owner: Address,
  tokens: Address[],
  opts: { fromBlock?: bigint; chunk?: bigint } = {},
): Promise<{ approvals: LiveApproval[]; errors: string[] }> {
  const errors: string[] = []
  const latest = await client.getBlockNumber()
  const chunk = opts.chunk ?? 5_000_000n
  const fromBlock = opts.fromBlock ?? 0n
  const pairs = new Map<string, { token: Address; spender: Address }>()

  for (const token of tokens) {
    for (let start = fromBlock; start <= latest; start += chunk) {
      const end = start + chunk - 1n > latest ? latest : start + chunk - 1n
      try {
        const logs = await client.getLogs({ address: token, event: approvalEvent, args: { owner }, fromBlock: start, toBlock: end })
        for (const l of logs) {
          const spender = getAddress(l.args.spender!)
          pairs.set(`${token.toLowerCase()}:${spender.toLowerCase()}`, { token, spender })
        }
      } catch (e) {
        errors.push(`${token}: ${(e as Error).message.slice(0, 160)}`)
        break
      }
    }
  }

  const approvals = await Promise.all(
    [...pairs.values()].map(async ({ token, spender }) => {
      const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
      return { token, spender, allowance, unlimited: allowance >= UNLIMITED_THRESHOLD }
    }),
  )
  return { approvals: approvals.filter((a) => a.allowance > 0n), errors }
}

export function readAllowance(client: PublicClient, token: Address, owner: Address, spender: Address) {
  return client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
}

/** Calldata to revoke an approval (approve(spender, 0)). */
export function revokeCalldata(spender: Address): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, 0n] })
}

export function approveCalldata(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] })
}
