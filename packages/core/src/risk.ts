/**
 * Human-readable transaction review and risk analysis.
 *
 * Used by every signing path — software signer, hardware companion and the
 * hardware device simulator — so the user always sees the same decoded view
 * of what they are about to approve.
 */
import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  maxUint256,
  parseAbi,
  type Address,
  type Hex,
} from 'viem'
import type { Finding } from './validation'

export const extraAbi = parseAbi([
  'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
])

/** Treat anything ≥ 2^255 as effectively unlimited (common "infinite approval" values). */
export const UNLIMITED_THRESHOLD = 2n ** 255n

export type DecodedAction =
  | { kind: 'native-transfer'; to: Address; value: bigint }
  | { kind: 'erc20-transfer'; token: Address; to: Address; amount: bigint }
  | { kind: 'erc20-transferFrom'; token: Address; from: Address; to: Address; amount: bigint }
  | { kind: 'erc20-approve'; token: Address; spender: Address; amount: bigint; unlimited: boolean }
  | { kind: 'set-approval-for-all'; collection: Address; operator: Address; approved: boolean }
  | { kind: 'contract-call'; to: Address; selector: Hex; value: bigint; functionName?: string }
  | { kind: 'contract-deploy'; value: bigint }

export interface TxLike {
  to?: Address | null
  value?: bigint
  data?: Hex
  chainId?: number
}

export function decodeTransaction(tx: TxLike, knownFunctions?: Record<string, string>): DecodedAction {
  const value = tx.value ?? 0n
  if (!tx.to) return { kind: 'contract-deploy', value }
  const to = getAddress(tx.to)
  const data = tx.data && tx.data !== '0x' ? tx.data : undefined
  if (!data) return { kind: 'native-transfer', to, value }

  try {
    const d = decodeFunctionData({ abi: erc20Abi, data })
    if (d.functionName === 'transfer') {
      const [rcpt, amount] = d.args
      return { kind: 'erc20-transfer', token: to, to: getAddress(rcpt), amount }
    }
    if (d.functionName === 'approve') {
      const [spender, amount] = d.args
      return { kind: 'erc20-approve', token: to, spender: getAddress(spender), amount, unlimited: amount >= UNLIMITED_THRESHOLD }
    }
    if (d.functionName === 'transferFrom') {
      const [from, rcpt, amount] = d.args
      return { kind: 'erc20-transferFrom', token: to, from: getAddress(from), to: getAddress(rcpt), amount }
    }
  } catch {
    /* not a plain ERC-20 call */
  }
  try {
    const d = decodeFunctionData({ abi: extraAbi, data })
    if (d.functionName === 'increaseAllowance') {
      const [spender, amount] = d.args
      return { kind: 'erc20-approve', token: to, spender: getAddress(spender), amount, unlimited: amount >= UNLIMITED_THRESHOLD }
    }
    if (d.functionName === 'setApprovalForAll') {
      const [operator, approved] = d.args
      return { kind: 'set-approval-for-all', collection: to, operator: getAddress(operator), approved }
    }
  } catch {
    /* unknown */
  }
  const selector = data.slice(0, 10) as Hex
  return { kind: 'contract-call', to, selector, value, functionName: knownFunctions?.[selector] }
}

export interface ReviewContext {
  from: Address
  expectedChainId: number
  nativeBalance?: bigint
  /** Addresses (lower-case) the user has flagged. */
  blocklist?: Set<string>
  /** Contracts the app itself knows (router, WIF, rewards…), lower-case → label. */
  knownContracts?: Record<string, string>
  tokenDecimals?: Record<string, number>
  tokenSymbols?: Record<string, string>
  maxFeeWei?: bigint
}

export interface TxReview {
  action: DecodedAction
  title: string
  lines: { label: string; value: string }[]
  findings: Finding[]
  /** Overall risk: highest finding severity. */
  risk: 'low' | 'medium' | 'high'
}

function fmt(amount: bigint, token: Address, ctx: ReviewContext): string {
  const key = token.toLowerCase()
  const dec = ctx.tokenDecimals?.[key]
  const sym = ctx.tokenSymbols?.[key] ?? 'tokens'
  return dec === undefined ? `${amount.toString()} base units of ${token}` : `${formatUnits(amount, dec)} ${sym}`
}

export function reviewTransaction(tx: TxLike, ctx: ReviewContext): TxReview {
  const action = decodeTransaction(tx)
  const findings: Finding[] = []
  const lines: { label: string; value: string }[] = []
  let title = 'Contract interaction'
  const label = (a: Address) => ctx.knownContracts?.[a.toLowerCase()]
  const flagged = (a: Address) => ctx.blocklist?.has(a.toLowerCase())

  if (tx.chainId !== undefined && tx.chainId !== ctx.expectedChainId) {
    findings.push({ code: 'chain-mismatch', severity: 'danger', message: `Transaction targets chain ${tx.chainId}, wallet is on ${ctx.expectedChainId}.` })
  }

  switch (action.kind) {
    case 'native-transfer':
      title = 'Send ETH'
      lines.push({ label: 'To', value: action.to }, { label: 'Amount', value: `${formatUnits(action.value, 18)} ETH` })
      if (flagged(action.to)) findings.push({ code: 'flagged-recipient', severity: 'danger', message: 'Recipient is on your flagged list.' })
      break
    case 'erc20-transfer':
      title = 'Send token'
      lines.push(
        { label: 'Token', value: label(action.token) ?? action.token },
        { label: 'To', value: action.to },
        { label: 'Amount', value: fmt(action.amount, action.token, ctx) },
      )
      if (flagged(action.to)) findings.push({ code: 'flagged-recipient', severity: 'danger', message: 'Recipient is on your flagged list.' })
      if (action.to === action.token)
        findings.push({ code: 'send-to-token', severity: 'danger', message: 'Recipient is the token contract itself — funds will likely be lost.' })
      break
    case 'erc20-transferFrom':
      title = 'Transfer from'
      lines.push({ label: 'From', value: action.from }, { label: 'To', value: action.to }, { label: 'Amount', value: fmt(action.amount, action.token, ctx) })
      if (getAddress(action.from) !== getAddress(ctx.from))
        findings.push({ code: 'transfer-from-other', severity: 'warning', message: 'This moves tokens from another address using an allowance.' })
      break
    case 'erc20-approve':
      title = action.amount === 0n ? 'Revoke token approval' : 'Approve token spending'
      lines.push(
        { label: 'Token', value: label(action.token) ?? action.token },
        { label: 'Spender', value: label(action.spender) ? `${label(action.spender)} (${action.spender})` : action.spender },
        { label: 'Allowance', value: action.unlimited ? 'UNLIMITED' : fmt(action.amount, action.token, ctx) },
      )
      if (action.unlimited)
        findings.push({
          code: 'unlimited-approval',
          severity: 'danger',
          message: 'Unlimited approval: the spender can move ALL of this token from your wallet, now and in future. Prefer an exact amount.',
        })
      if (action.amount > 0n && !label(action.spender))
        findings.push({ code: 'unknown-spender', severity: 'warning', message: 'Spender is not a contract InWIF recognises. Verify it on the explorer.' })
      if (flagged(action.spender)) findings.push({ code: 'flagged-spender', severity: 'danger', message: 'Spender is on your flagged list.' })
      break
    case 'set-approval-for-all':
      title = action.approved ? 'Approve entire collection' : 'Revoke collection approval'
      lines.push({ label: 'Collection', value: action.collection }, { label: 'Operator', value: action.operator })
      if (action.approved)
        findings.push({ code: 'approval-for-all', severity: 'danger', message: 'Grants the operator control over every item in this collection.' })
      break
    case 'contract-call':
      title = label(action.to) ? `Interact with ${label(action.to)}` : 'Contract interaction'
      lines.push({ label: 'Contract', value: action.to }, { label: 'Function', value: action.functionName ?? action.selector })
      if (action.value > 0n) lines.push({ label: 'Value', value: `${formatUnits(action.value, 18)} ETH` })
      if (!label(action.to))
        findings.push({ code: 'unknown-contract', severity: 'warning', message: 'Unrecognised contract. Only continue if you trust the application that created this request.' })
      if (flagged(action.to)) findings.push({ code: 'flagged-contract', severity: 'danger', message: 'Contract is on your flagged list.' })
      break
    case 'contract-deploy':
      title = 'Deploy contract'
      findings.push({ code: 'deploy', severity: 'warning', message: 'This transaction deploys a new contract.' })
      break
  }

  const value = tx.value ?? 0n
  if (ctx.nativeBalance !== undefined) {
    const total = value + (ctx.maxFeeWei ?? 0n)
    if (total > ctx.nativeBalance)
      findings.push({ code: 'insufficient-native', severity: 'danger', message: 'Not enough ETH to cover the amount plus the maximum network fee.' })
  }
  if (ctx.maxFeeWei !== undefined) lines.push({ label: 'Max network fee', value: `${formatUnits(ctx.maxFeeWei, 18)} ETH` })
  lines.push({ label: 'InWIF fee', value: 'None — InWIF never charges fees' })

  findings.push({
    code: 'not-a-guarantee',
    severity: 'info',
    message: 'Absence of warnings does not mean a transaction or address is safe.',
  })

  const risk = findings.some((f) => f.severity === 'danger')
    ? 'high'
    : findings.some((f) => f.severity === 'warning')
      ? 'medium'
      : 'low'
  return { action, title, lines, findings, risk }
}

export { maxUint256 }
