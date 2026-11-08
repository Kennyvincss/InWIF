'use client'
import { useState } from 'react'
import { Download, PlusSquare, Share } from 'lucide-react'
import { useInstall } from '@/lib/install'
import { Modal, cx } from './ui'

/** "Install app" — one tap on Android/desktop Chrome; step-by-step on iPhone. Hidden once installed. */
export function InstallButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const install = useInstall()
  const [iosHelp, setIosHelp] = useState(false)
  if (install.installed || (!install.canPrompt && !install.ios)) return null
  return (
    <>
      <button
        type="button"
        className={cx(compact ? 'rounded-full border border-white/[0.08] bg-white/[0.03] p-2 transition hover:border-white/[0.16] hover:bg-white/[0.06]' : 'btn-ghost', className)}
        onClick={() => (install.canPrompt ? void install.prompt() : setIosHelp(true))}
        aria-label="Install app"
        title="Install InWIF on this device"
      >
        <Download className="h-4 w-4" />
        {!compact && 'Install app'}
      </button>
      <Modal open={iosHelp} onClose={() => setIosHelp(false)} title="Install InWIF on your iPhone">
        <ol className="space-y-4 text-sm">
          {[
            { icon: Share, t: 'Tap the Share button', b: 'In Safari, at the bottom (or top) of the screen.' },
            { icon: PlusSquare, t: 'Choose "Add to Home Screen"', b: 'Scroll down the share menu if you don’t see it.' },
            { icon: Download, t: 'Tap "Add"', b: 'InWIF appears on your home screen and opens full-screen, like an app.' },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-accent">
                <s.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium">
                  {i + 1}. {s.t}
                </p>
                <p className="text-mute">{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
        <button className="btn-primary mt-6 w-full" onClick={() => setIosHelp(false)}>
          Got it
        </button>
      </Modal>
    </>
  )
}
