import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { bytesToHex, isHex, type Hex } from 'viem'
import { mnemonicToAccount, privateKeyToAccount, type HDAccount, type PrivateKeyAccount } from 'viem/accounts'
import { randomBytes } from './keystore'

/** Standard Ethereum derivation path (BIP-44, coin type 60). */
export const derivationPath = (index: number) => `m/44'/60'/0'/0/${index}` as const

export type MnemonicStrength = 128 | 256 // 12 or 24 words

export function createMnemonic(strength: MnemonicStrength = 128): string {
  return generateMnemonic(wordlist, strength)
}

/** Normalise user input: lowercase, single spaces, trimmed. */
export function normaliseMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(' ')
}

export interface MnemonicValidation {
  ok: boolean
  wordCount: number
  unknownWords: string[]
  error?: string
}

export function checkMnemonic(input: string): MnemonicValidation {
  const phrase = normaliseMnemonic(input)
  const words = phrase ? phrase.split(' ') : []
  const unknownWords = words.filter((w) => !wordlist.includes(w))
  if (![12, 15, 18, 21, 24].includes(words.length))
    return { ok: false, wordCount: words.length, unknownWords, error: 'Recovery phrases have 12, 15, 18, 21 or 24 words.' }
  if (unknownWords.length)
    return { ok: false, wordCount: words.length, unknownWords, error: 'Some words are not in the BIP-39 English word list.' }
  if (!validateMnemonic(phrase, wordlist))
    return { ok: false, wordCount: words.length, unknownWords, error: 'Checksum is invalid — check the word order.' }
  return { ok: true, wordCount: words.length, unknownWords: [] }
}

export function accountFromMnemonic(phrase: string, index = 0): HDAccount {
  return mnemonicToAccount(normaliseMnemonic(phrase), { addressIndex: index })
}

export function normalisePrivateKey(input: string): Hex | null {
  let k = input.trim()
  if (!k.startsWith('0x')) k = `0x${k}`
  if (!isHex(k) || k.length !== 66) return null
  // Reject the zero key and keys >= secp256k1 curve order.
  const n = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141')
  const v = BigInt(k)
  if (v === 0n || v >= n) return null
  return k.toLowerCase() as Hex
}

export function accountFromPrivateKey(key: Hex): PrivateKeyAccount {
  return privateKeyToAccount(key)
}

/** Derive a raw private key for an index — used only by the local signer inside the unlocked session. */
export function derivePrivateKey(phrase: string, index = 0): Hex {
  const seed = mnemonicToSeedSync(normaliseMnemonic(phrase))
  const node = HDKey.fromMasterSeed(seed).derive(derivationPath(index))
  if (!node.privateKey) throw new Error('Derivation failed')
  const hex = bytesToHex(node.privateKey)
  node.wipePrivateData()
  seed.fill(0)
  return hex
}

/**
 * Pick `count` distinct word positions (0-based) for the backup-verification quiz,
 * using a CSPRNG so the positions are not predictable.
 */
export function pickVerificationIndices(wordCount: number, count = 3): number[] {
  if (count > wordCount) throw new Error('count exceeds word count')
  const picked = new Set<number>()
  while (picked.size < count) {
    const r = randomBytes(4)
    const n = ((r[0]! << 24) | (r[1]! << 16) | (r[2]! << 8) | r[3]!) >>> 0
    // Rejection sampling to avoid modulo bias.
    const limit = Math.floor(0x1_0000_0000 / wordCount) * wordCount
    if (n >= limit) continue
    picked.add(n % wordCount)
  }
  return [...picked].sort((a, b) => a - b)
}

/**
 * Check the backup quiz. Every position in `required` (the quiz the user was shown)
 * must be answered with the right word; with no `required`, every given answer must
 * match and there must be at least one. Empty or missing answers never pass.
 */
export function verifyBackupWords(phrase: string, answers: Record<number, string>, required?: readonly number[]): boolean {
  const words = normaliseMnemonic(phrase).split(' ')
  const positions = required ?? Object.keys(answers).map(Number)
  if (positions.length === 0) return false
  return positions.every((i) => {
    const w = answers[i]?.trim().toLowerCase()
    return !!w && words[i] === w
  })
}

export { wordlist as bip39Wordlist }
