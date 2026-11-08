import { Cpu, Eye, Globe, KeyRound, Layers, Lock, ServerOff, ShieldCheck, TriangleAlert } from 'lucide-react'
import { SitePage, Section } from '@/components/site/Site'

export const metadata = { title: 'InWIF security model' }

const LAYERS: [string, string, typeof KeyRound][] = [
  ['Keys made on your device', 'Your recovery phrase is created on your own device using proven, widely used libraries. InWIF never makes or sees it.', KeyRound],
  ['Locked with your password', 'Each wallet is encrypted with your password and stays on your device. Unlocked keys live only in memory and are wiped when you lock or step away.', Lock],
  ['Wallets kept separate', 'Every wallet has its own lock. Opening one never opens another.', Layers],
  ['Right network, every time', 'Before anything is signed, InWIF checks it is really talking to Robinhood Chain. If it can\'t confirm that, signing stops.', Globe],
  ['See before you sign', 'Every transaction is checked first and explained in plain words, with clear warnings for anything risky.', Eye],
  ['Safe approvals', 'Apps only get permission for the exact amount by default. You can see and remove every permission in the Security Centre.', ShieldCheck],
  ['Nothing secret on our servers', 'InWIF\'s servers never receive your recovery phrase or keys, and refuse anything that looks like one.', ServerOff],
  ['Hardware wallet (coming soon)', 'InWIF One will show every transaction on its own screen and wait for a physical button press.', Cpu],
  ['A hardened website', 'No third-party scripts, and the site cannot be embedded or talk to unknown servers.', Globe],
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
      <Section eyebrow="Security" title={<>How InWIF protects you. <span className="text-mute">And what it can&apos;t.</span></>}>
        <div className="grid gap-4 md:grid-cols-3">
          {LAYERS.map(([t, b, Icon]) => (
            <div key={t} className="card card-hover group p-6">
              <span className="inline-grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] transition group-hover:border-accent/40 group-hover:text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-5 font-medium">{t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-mute">{b}</p>
            </div>
          ))}
        </div>
        <div className="card mt-10 border-warn/25 p-7">
          <p className="flex items-center gap-2 font-medium text-warn">
            <TriangleAlert className="h-4 w-4" /> Limits we want you to know
          </p>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-mute">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-3">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn/70" />
                {l}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-sm text-dim">Found a vulnerability? Please report it privately to the InWIF team rather than posting it publicly.</p>
      </Section>
    </SitePage>
  )
}
