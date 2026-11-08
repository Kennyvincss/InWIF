'use client'
/**
 * "Install app" support. Chrome/Edge/Android fire `beforeinstallprompt` (often before React
 * mounts), so it is captured at module load. iPhone/iPad Safari has no prompt: people use
 * Share → Add to Home Screen, which the UI explains instead.
 */
import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DESKTOP === '1') return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

export function useInstall() {
  const [, force] = useState(0)
  const [env, setEnv] = useState({ standalone: false, ios: false })
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    const ua = navigator.userAgent
    setEnv({
      standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
      ios: /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1),
    })
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    installed: env.standalone,
    canPrompt: !!deferred && !env.standalone,
    ios: env.ios && !env.standalone,
    prompt: async () => {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      force((n) => n + 1)
      return outcome === 'accepted'
    },
  }
}
