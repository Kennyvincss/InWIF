/**
 * Transaction pipeline shared by software and hardware wallets:
 *   build → verify network → review → simulate → user confirms → sign → broadcast.
 *
 * `sendTransaction` never signs unless `confirmed: true` is passed by the UI
 * after the user has seen the review, and never signs on a network that
 * failed runtime verification.
 */
import {
  type Address,
  type Hex,
  type PublicClient,
  type TransactionSerializableEIP1559,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { NetworkConfig } from './networks'
import type { NetworkVerification } from './client'
import type { HardwareWallet } from './hardware/companion'

export interface SignerHandle {
  kind: 'software' | 'hardware'
  address: Address
  signTransaction(tx: TransactionSerializableEIP1559): Promise<Hex>
}

export function softwareSigner(privateKey: Hex): SignerHandle {
  const account = privateKeyToAccount(privateKey)
  return {
    kind: 'software',
    address: account.address,
    signTransaction: (tx) => account.signTransaction({ ...tx, type: 'eip1559' }),
  }
}

export function hardwareSigner(hw: HardwareWallet, index: number, address: Address): SignerHandle {
  return { kind: 'hardware', address, signTransaction: (tx) => hw.signTransaction(tx, index, address) }
}

export interface PreparedTx {
  network: NetworkConfig
  tx: TransactionSerializableEIP1559
}

export async function prepareTransaction(
  client: PublicClient,
  network: NetworkConfig,
  from: Address,
  req: { to: Address; value?: bigint; data?: Hex; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
): Promise<PreparedTx> {
  const nonce = await client.getTransactionCount({ address: from, blockTag: 'pending' })
  return {
    network,
    tx: {
      type: 'eip1559',
      chainId: network.chainId,
      nonce,
      to: req.to,
      value: req.value ?? 0n,
      data: req.data,
      gas: req.gas,
      maxFeePerGas: req.maxFeePerGas,
      maxPriorityFeePerGas: req.maxPriorityFeePerGas,
    },
  }
}

export class SigningRefused extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'SigningRefused'
  }
}

export async function signAndBroadcast(
  client: PublicClient,
  prepared: PreparedTx,
  signer: SignerHandle,
  opts: { confirmed: boolean; verification: NetworkVerification | null },
): Promise<Hex> {
  if (!opts.confirmed) throw new SigningRefused('User has not confirmed this transaction.')
  if (!prepared.network.transactionsEnabled) throw new SigningRefused(`Transactions are disabled on ${prepared.network.name}.`)
  if (!opts.verification?.ok || opts.verification.chainId !== prepared.tx.chainId)
    throw new SigningRefused('Network could not be verified against the live RPC. Signing is disabled.')
  const signed = await signer.signTransaction(prepared.tx)
  return client.sendRawTransaction({ serializedTransaction: signed })
}
