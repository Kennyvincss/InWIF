/**
 * Optional, transparently funded ecosystem rewards.
 *
 * Campaign allocations are published as a Merkle tree (OpenZeppelin
 * StandardMerkleTree). The `InWIFRewards` contract only pays out tokens that
 * a funder has already deposited for that campaign, so rewards can never be
 * promised beyond what is on-chain. Rewards are never required for, and never
 * unlock, any wallet feature.
 */
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getAddress, parseAbi, type Address, type Hex } from 'viem'

export const REWARD_LEAF_ENCODING = ['uint256', 'address', 'uint256'] as const

export interface Allocation {
  account: Address
  amount: bigint
}

export interface CampaignTree {
  campaignId: bigint
  root: Hex
  total: bigint
  tree: StandardMerkleTree<[string, string, string]>
}

export function buildCampaignTree(campaignId: bigint, allocations: Allocation[]): CampaignTree {
  const seen = new Set<string>()
  for (const a of allocations) {
    const k = getAddress(a.account)
    if (seen.has(k)) throw new Error(`Duplicate allocation for ${k}`)
    if (a.amount <= 0n) throw new Error(`Allocation for ${k} must be positive`)
    seen.add(k)
  }
  const values = allocations.map((a) => [campaignId.toString(), getAddress(a.account), a.amount.toString()] as [string, string, string])
  const tree = StandardMerkleTree.of(values, [...REWARD_LEAF_ENCODING])
  return { campaignId, root: tree.root as Hex, total: allocations.reduce((s, a) => s + a.amount, 0n), tree }
}

export function proofFor(t: CampaignTree, account: Address): { amount: bigint; proof: Hex[] } | null {
  const target = getAddress(account)
  for (const [i, v] of t.tree.entries()) {
    if (getAddress(v[1]) === target) return { amount: BigInt(v[2]), proof: t.tree.getProof(i) as Hex[] }
  }
  return null
}

export const inwifRewardsAbi = parseAbi([
  'function campaignCount() view returns (uint256)',
  'function campaigns(uint256 id) view returns (address token, bytes32 merkleRoot, uint256 funded, uint256 claimed, uint64 claimDeadline, bool active, string metadataURI)',
  'function hasClaimed(uint256 id, address account) view returns (bool)',
  'function claim(uint256 id, uint256 amount, bytes32[] proof)',
  'event CampaignCreated(uint256 indexed id, address indexed token, bytes32 merkleRoot, uint64 claimDeadline, string metadataURI)',
  'event CampaignFunded(uint256 indexed id, address indexed funder, uint256 amount)',
  'event Claimed(uint256 indexed id, address indexed account, uint256 amount)',
])

/** Address of a deployed InWIFRewards contract, if any. None is deployed to mainnet by InWIF. */
export function rewardsContractAddress(chainId: number): Address | undefined {
  const v =
    typeof process !== 'undefined'
      ? chainId === 4663
        ? process.env?.NEXT_PUBLIC_REWARDS_ADDRESS_4663
        : chainId === 46630
          ? process.env?.NEXT_PUBLIC_REWARDS_ADDRESS_46630
          : process.env?.NEXT_PUBLIC_REWARDS_ADDRESS_31337
      : undefined
  return v ? getAddress(v) : undefined
}

/** Built-in, off-chain learning quests. Completing them is free and earns nothing on its own. */
export const SECURITY_QUESTS = [
  { id: 'backup', title: 'Back up your recovery phrase', body: 'Write your phrase on paper, verify it, and store it offline.' },
  { id: 'approvals', title: 'Review your token approvals', body: 'Open the Security Centre and revoke approvals you no longer need.' },
  { id: 'simulate', title: 'Read a transaction simulation', body: 'Before your next transaction, read every line of the review screen.' },
  { id: 'phishing', title: 'Spot a phishing request', body: 'InWIF will never ask for your recovery phrase. Nobody legitimate will.' },
  { id: 'hardware', title: 'Try offline signing', body: 'Sign a transaction with the hardware simulator and see the key never leave the device.' },
] as const
