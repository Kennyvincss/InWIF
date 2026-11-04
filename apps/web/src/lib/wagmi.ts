'use client'
import { createConfig, http, injected } from 'wagmi'
import { ROBINHOOD_MAINNET, ROBINHOOD_TESTNET, toViemChain } from '@inwif/core'

const rh = toViemChain(ROBINHOOD_MAINNET)
const rhTest = toViemChain(ROBINHOOD_TESTNET)

/**
 * Used only for "Connect Wallet": viewing the $WIF profile of an external
 * browser wallet (read-only). InWIF never asks an external wallet to sign
 * anything from this flow.
 */
export const wagmiConfig = createConfig({
  chains: [rh, rhTest],
  connectors: [injected()],
  transports: { [rh.id]: http(ROBINHOOD_MAINNET.rpcUrls[0]), [rhTest.id]: http(ROBINHOOD_TESTNET.rpcUrls[0]) },
  ssr: true,
})
