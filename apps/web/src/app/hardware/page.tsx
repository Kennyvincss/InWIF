import Link from 'next/link'
import { SitePage, Section } from '@/components/site/Site'
import { DeviceRender } from '@/components/site/DeviceRender'

export const metadata = { title: 'InWIF One hardware wallet (prototype)' }

const STAGES = [
  { n: 1, t: 'Architecture & interface prototype', s: 'done', b: 'IWDP v1 protocol, companion driver, browser device simulator.' },
  { n: 2, t: 'Secure signing prototype', s: 'in progress', b: 'Rust firmware core (protocol, tx decoding, secp256k1 signing) with host tests; dev-board bring-up next.' },
  { n: 3, t: 'Custom PCB & firmware', s: 'planned', b: 'Secure element integration, secure boot, display and button drivers.' },
  { n: 4, t: 'Independent security testing', s: 'planned', b: 'Third-party firmware review and hardware attack testing (fault injection, side channels).' },
  { n: 5, t: 'Production enclosure', s: 'planned', b: 'Aluminium enclosure, manufacturing partner, device attestation at the factory.' },
]

export default function HardwarePage() {
  return (
    <SitePage>
      <Section eyebrow="InWIF One · prototype" title="Hardware-grade self-custody, designed in the open.">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <DeviceRender />
          <div className="space-y-4 text-mute">
            <p>InWIF One is a dedicated signing device: your keys are generated inside it and never leave it. The companion app prepares transactions; the device shows you exactly what you are signing and waits for your physical confirmation.</p>
            <p className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-[#ffe7a8]">
              Status: prototype. No InWIF One device has been manufactured or independently tested, and none is for sale. Images on this page are concept renders.
            </p>
            <div className="flex gap-3">
              <Link href="/app/hardware" className="btn-primary">Try the device simulator</Link>
              <Link href="/docs#hardware" className="btn-ghost">Protocol docs</Link>
            </div>
          </div>
        </div>
      </Section>
      <Section eyebrow="Proposed specification" title="What goes inside.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Secure element', 'CC EAL5+ / EAL6+ certified secure element for key storage and signing (candidates: Infineon OPTIGA Trust M, NXP SE050, Microchip ATECC608B — selection pending evaluation).'],
            ['Application MCU', 'Separate MCU drives the display and USB and never holds key material in production firmware.'],
            ['Secure boot', 'Boot ROM verifies the firmware signature against a vendor key fused at manufacture. Downgrades refused.'],
            ['Display & buttons', 'On-device screen with two physical buttons. Every signature requires a press; details rendered by the device itself.'],
            ['USB-C', 'CDC serial transport speaking IWDP v1. Optional BLE only after independent review.'],
            ['Attestation', 'Per-device attestation key certified by the InWIF vendor root, checked by the app with a fresh challenge.'],
          ].map(([t, b]) => (
            <div key={t} className="card p-5">
              <p className="font-semibold">{t}</p>
              <p className="mt-1.5 text-sm text-mute">{b}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section eyebrow="Offline signing" title="Eight steps. Your key stays home.">
        <ol className="grid gap-3 md:grid-cols-4">
          {['App builds the transaction', 'Sent to the device', 'Device decodes & displays', 'You verify on the device', 'You press confirm', 'Device signs internally', 'Signature returns', 'App broadcasts'].map((s, i) => (
            <li key={s} className="card p-4 text-sm">
              <span className="font-display text-2xl font-extrabold text-lime">{i + 1}</span>
              <p className="mt-1">{s}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section eyebrow="Roadmap" title="Development stages.">
        <ol className="space-y-3">
          {STAGES.map((s) => (
            <li key={s.n} className="card flex flex-wrap items-center gap-4 p-5">
              <span className="font-display text-2xl font-extrabold text-lime">{s.n}</span>
              <div className="flex-1">
                <p className="font-semibold">{s.t}</p>
                <p className="text-sm text-mute">{s.b}</p>
              </div>
              <span className={`chip ${s.s === 'done' ? 'border-ok/40 text-ok' : s.s === 'in progress' ? 'border-lime/40 text-lime' : ''}`}>{s.s}</span>
            </li>
          ))}
        </ol>
      </Section>
    </SitePage>
  )
}
