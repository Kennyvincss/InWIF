import { useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { HardwareWallet, SimulatedDevice, SimulatorTransport, type DevicePrompt } from '@inwif/core'
import { Button, Card, Notice, s } from '../ui'
import { C } from '../theme'

/**
 * Mobile hardware connection. Physical InWIF devices will connect over USB-C (Android, iOS via
 * MFi/USB-C) or BLE once the device exists; until then the simulator shows the full flow.
 */
export function Hardware() {
  const [prompt, setPrompt] = useState<{ p: DevicePrompt; resolve: (ok: boolean) => void } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const hw = useRef<HardwareWallet | null>(null)
  const dev = useRef<SimulatedDevice | null>(null)

  function start() {
    const d = new SimulatedDevice({ confirm: (p) => new Promise((resolve) => setPrompt({ p, resolve })), showRecoveryPhrase: () => setLog((l) => [...l, 'Recovery phrase shown on device screen only']) })
    d.setupNew('246810')
    dev.current = d
    hw.current = new HardwareWallet(new SimulatorTransport(d))
    setLog(['Simulator started (not secure hardware)'])
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={s.h1}>Hardware</Text>
      <Notice tone="warn" text="InWIF One is a prototype in development. The simulator demonstrates the protocol; it is not secure hardware." />
      {!hw.current ? (
        <Button title="Start device simulator" onPress={start} />
      ) : (
        <>
          <Button
            title="Verify authenticity"
            kind="ghost"
            onPress={async () => {
              const r = await hw.current!.verifyAuthenticity()
              setLog((l) => [...l, r.reason ?? 'Genuine device'])
            }}
          />
          <Button
            title="Show address on device"
            kind="ghost"
            onPress={async () => {
              try {
                const a = await hw.current!.getAddress(0, true)
                setLog((l) => [...l, `Device confirmed ${a}`])
              } catch (e) {
                setLog((l) => [...l, (e as Error).message])
              }
            }}
          />
        </>
      )}
      {prompt && (
        <View style={{ backgroundColor: '#05070a', borderRadius: 20, padding: 16, borderWidth: 2, borderColor: '#2a313b', gap: 6 }}>
          <Text style={{ color: C.lime, fontWeight: '800' }}>{prompt.p.title.toUpperCase()}</Text>
          {prompt.p.lines.map((l) => (
            <Text key={l.label} style={[s.mono, { color: C.limeSoft }]}>
              {l.label}: {l.value}
            </Text>
          ))}
          <View style={[s.row, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Button title="✕ Reject" kind="danger" onPress={() => (prompt.resolve(false), setPrompt(null))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="✓ Approve" onPress={() => (prompt.resolve(true), setPrompt(null))} />
            </View>
          </View>
        </View>
      )}
      {log.length > 0 && (
        <Card>
          {log.map((l, i) => (
            <Text key={i} style={s.mute}>
              • {l}
            </Text>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}
