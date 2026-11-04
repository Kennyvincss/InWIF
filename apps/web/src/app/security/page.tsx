import { SitePage, Section } from '@/components/site/Site'

export const metadata = { title: 'InWIF security model' }

const LAYERS = [
  ['Key generation', 'BIP-39 phrases and BIP-32/44 derivation use the audited @scure libraries. Randomness from the platform CSPRNG (crypto.getRandomValues). No custom cryptography.'],
  ['Key storage', 'Per-wallet vaults: PBKDF2-HMAC-SHA256 (600,000 iterations) → AES-256-GCM via WebCrypto. Unique salt and IV per vault. Decrypted keys live only in memory and are cleared on lock or auto-lock.'],
  ['Isolation between wallets', 'Each wallet has its own vault and password. Unlocking one never decrypts another.'],
  ['Network verification', 'Before any signature the RPC must report the expected chain ID. A mismatch or unreachable RPC disables signing.'],
  ['Transaction review', 'Every request is decoded (transfers, approvals, contract calls), simulated against the latest block, and annotated with risk findings.'],
  ['Approval hygiene', 'Exact-amount approvals by default; unlimited approvals require an explicit opt-in and are flagged high risk. Live allowances can be revoked from the Security Centre.'],
  ['No secrets on servers', 'The InWIF backend stores only public data. Its APIs reject any payload containing secret-shaped values, and logs are redacted.'],
  ['Hardware path', 'Device decodes and displays transactions itself, PIN on-device, physical confirmation, on-device chain allow-list, attestation and signed firmware.'],
  ['Web hardening', 'Strict Content-Security-Policy, no third-party scripts, frame-ancestors none, no-referrer.'],
]

const LIMITS = [
  'Malware on your computer or phone can read what you type and see what you see. A hardware wallet reduces — not removes — this risk.',
  'InWIF cannot detect every malicious contract or address. The absence of a warning is not a guarantee of safety.',
  'Browser storage can be cleared. Your recovery phrase is the only backup that matters.',
  'InWIF has not yet been independently audited. The hardware wallet is a prototype and makes no hardware-security claim yet.',
]

export default function SecurityPage() {
  return (
    <SitePage>
      <Section eyebrow="Security model" title="How InWIF protects you — and what it can't.">
        <div className="grid gap-4 md:grid-cols-3">
          {LAYERS.map(([t, b]) => (
            <div key={t} className="card p-5">
              <p className="font-semibold">{t}</p>
              <p className="mt-1.5 text-sm text-mute">{b}</p>
            </div>
          ))}
        </div>
        <div className="card mt-10 border-warn/30 p-6">
          <p className="font-display text-lg font-bold">Limits we want you to know</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-mute">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        <p className="mt-8 text-sm text-mute">Found a vulnerability? Please report it privately to the maintainers via the repository&apos;s security policy (SECURITY.md) rather than opening a public issue.</p>
      </Section>
    </SitePage>
  )
}
