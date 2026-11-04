'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import {
  HardwareWallet,
  SimulatedDevice,
  SimulatorTransport,
  WebSerialTransport,
  type AuthenticityResult,
  type DeviceInfo,
  type DevicePrompt,
  type SimulatorState,
} from '@inwif/core'

export interface SigningStep {
  at: number
  step: number
  text: string
}

interface PendingPrompt {
  prompt: DevicePrompt
  resolve: (ok: boolean) => void
}

interface HwCtx {
  hw: HardwareWallet | null
  info: DeviceInfo | null
  simulator: SimulatedDevice | null
  simState: SimulatorState | null
  pending: PendingPrompt | null
  recoveryWords: string[] | null
  authenticity: AuthenticityResult | null
  lastSync: number | null
  steps: SigningStep[]
  panelOpen: boolean
  setPanelOpen: (o: boolean) => void
  startSimulator: () => SimulatedDevice
  connectWebSerial: () => Promise<void>
  refreshInfo: () => Promise<DeviceInfo | null>
  verify: () => Promise<AuthenticityResult>
  disconnect: () => Promise<void>
  clearRecoveryWords: () => void
  logStep: (step: number, text: string) => void
  resetSteps: () => void
}

const Ctx = createContext<HwCtx | null>(null)

export function HardwareProvider({ children }: { children: React.ReactNode }) {
  const [hw, setHw] = useState<HardwareWallet | null>(null)
  const [info, setInfo] = useState<DeviceInfo | null>(null)
  const [simulator, setSimulator] = useState<SimulatedDevice | null>(null)
  const [simState, setSimState] = useState<SimulatorState | null>(null)
  const [pending, setPending] = useState<PendingPrompt | null>(null)
  const [recoveryWords, setRecoveryWords] = useState<string[] | null>(null)
  const [authenticity, setAuthenticity] = useState<AuthenticityResult | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [steps, setSteps] = useState<SigningStep[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const hwRef = useRef<HardwareWallet | null>(null)

  const logStep = useCallback((step: number, text: string) => setSteps((s) => [...s, { at: Date.now(), step, text }]), [])

  const refreshInfo = useCallback(async () => {
    if (!hwRef.current) return null
    const i = await hwRef.current.getInfo()
    setInfo(i)
    setLastSync(Date.now())
    return i
  }, [])

  const startSimulator = useCallback(() => {
    const device = new SimulatedDevice({
      confirm: (prompt) =>
        new Promise<boolean>((resolve) => {
          setPanelOpen(true)
          if (prompt.kind === 'sign-tx') logStep(3, 'Device decoded the transaction and is displaying it')
          setPending({
            prompt,
            resolve: (ok) => {
              setPending(null)
              resolve(ok)
            },
          })
        }),
      showRecoveryPhrase: (w) => setRecoveryWords(w),
      onStateChange: (s) => setSimState(s),
    })
    const h = new HardwareWallet(new SimulatorTransport(device))
    hwRef.current = h
    setSimulator(device)
    setSimState(device.state)
    setHw(h)
    setAuthenticity(null)
    setPanelOpen(true)
    void h.getInfo().then((i) => {
      setInfo(i)
      setLastSync(Date.now())
    })
    return device
  }, [logStep])

  const connectWebSerial = useCallback(async () => {
    const t = await WebSerialTransport.request()
    const h = new HardwareWallet(t)
    hwRef.current = h
    setHw(h)
    setSimulator(null)
    setSimState(null)
    setAuthenticity(null)
    await refreshInfo()
  }, [refreshInfo])

  const verify = useCallback(async () => {
    if (!hwRef.current) throw new Error('No device connected')
    const r = await hwRef.current.verifyAuthenticity()
    setAuthenticity(r)
    setLastSync(Date.now())
    return r
  }, [])

  const disconnect = useCallback(async () => {
    pending?.resolve(false)
    await hwRef.current?.close()
    hwRef.current = null
    setHw(null)
    setInfo(null)
    setSimulator(null)
    setSimState(null)
    setAuthenticity(null)
    setRecoveryWords(null)
  }, [pending])

  return (
    <Ctx.Provider
      value={{
        hw,
        info,
        simulator,
        simState,
        pending,
        recoveryWords,
        authenticity,
        lastSync,
        steps,
        panelOpen,
        setPanelOpen,
        startSimulator,
        connectWebSerial,
        refreshInfo,
        verify,
        disconnect,
        clearRecoveryWords: () => setRecoveryWords(null),
        logStep,
        resetSteps: () => setSteps([]),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useHardware() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useHardware must be used inside HardwareProvider')
  return c
}
