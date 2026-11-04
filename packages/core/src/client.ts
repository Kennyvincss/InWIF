import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import { toViemChain, type NetworkConfig } from './networks'

const cache = new Map<string, PublicClient>()

/** Read-only RPC client for a network (cached). Uses RPC fallbacks in order. */
export function getPublicClient(network: NetworkConfig): PublicClient {
  const key = `${network.key}:${network.rpcUrls.join(',')}`
  const existing = cache.get(key)
  if (existing) return existing
  const transports = network.rpcUrls.map((u) => http(u, { timeout: 15_000, retryCount: 1 }))
  const client = createPublicClient({
    chain: toViemChain(network),
    transport: transports.length > 1 ? fallback(transports) : transports[0]!,
  }) as PublicClient
  cache.set(key, client)
  return client
}

export type NetworkVerification =
  | { ok: true; chainId: number; blockNumber: bigint; checkedAt: number }
  | { ok: false; reason: string; observedChainId?: number; checkedAt: number }

/**
 * Verify, against the live RPC, that the endpoint is the network we think it is.
 * The wallet refuses to sign transactions unless this returns `ok: true`.
 */
export async function verifyNetwork(
  network: NetworkConfig,
  client: Pick<PublicClient, 'getChainId' | 'getBlockNumber'> = getPublicClient(network),
): Promise<NetworkVerification> {
  const checkedAt = Date.now()
  try {
    const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()])
    if (chainId !== network.chainId) {
      return {
        ok: false,
        reason: `RPC reported chain ID ${chainId}, expected ${network.chainId}. Signing disabled.`,
        observedChainId: chainId,
        checkedAt,
      }
    }
    return { ok: true, chainId, blockNumber, checkedAt }
  } catch (e) {
    return {
      ok: false,
      reason: `Could not reach ${network.name} RPC: ${(e as Error).message ?? 'unknown error'}`,
      checkedAt,
    }
  }
}
