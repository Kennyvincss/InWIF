'use client'
import { useEffect, useRef, useState } from 'react'
import { decodeQr, extractWcUri } from '@/lib/qr'
import { ErrorBox, Spinner } from './ui'

/**
 * Live camera QR scanner for WalletConnect links. Frames are decoded on-device
 * and never leave the browser. Stops the camera as soon as a link is found or
 * the scanner closes.
 */
export function QrScanner({ onScan }: { onScan: (uri: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    let busy = false
    let lastWrong = 0

    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot use the camera here. Use "Scan from image" or paste the link instead.')
        setStatus('error')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch (e) {
        const name = (e as DOMException).name
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or paste the link instead.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found. Use "Scan from image" or paste the link instead.'
              : `Could not start the camera (${name || 'unknown error'}).`,
        )
        setStatus('error')
        return
      }
      if (stopped || !video.current) return stop()
      video.current.srcObject = stream
      await video.current.play().catch(() => undefined)
      setStatus('scanning')

      const tick = async () => {
        if (stopped) return
        if (!busy && video.current && video.current.readyState >= 2) {
          busy = true
          try {
            const text = await decodeQr(video.current)
            if (text) {
              const uri = extractWcUri(text)
              if (uri) {
                stop()
                onScan(uri)
                return
              }
              if (Date.now() - lastWrong > 1500) {
                lastWrong = Date.now()
                setHint('That QR code is not a WalletConnect link. Choose WalletConnect on the app and scan its QR code.')
              }
            }
          } finally {
            busy = false
          }
        }
        raf = requestAnimationFrame(() => void tick())
      }
      raf = requestAnimationFrame(() => void tick())
    })()

    return stop
  }, [onScan])

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: '4 / 3' }}>
        {/* Absolutely positioned so the camera's native resolution can never widen the dialog. */}
        <video ref={video} className="absolute inset-0 h-full w-full object-cover" playsInline muted aria-label="Camera preview for QR scanning" />
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-3/5 w-3/5 rounded-2xl border-2 border-lime/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-mute">
            <Spinner /> Starting camera…
          </div>
        )}
      </div>
      {status === 'scanning' && <p className="text-center text-xs text-mute">Point the camera at the app&apos;s WalletConnect QR code.</p>}
      {hint && status === 'scanning' && <p className="text-center text-xs text-warn">{hint}</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  )
}
