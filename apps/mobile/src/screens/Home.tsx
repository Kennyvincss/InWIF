import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { formatUnits } from 'viem'
import { DEFAULT_TOKENS, NETWORKS, readBalances, verifyNetwork, type Balance, type NetworkVerification } from '@inwif/core'
import { useAppState } from '../state'
import { Button, Card, Notice, s } from '../ui'
import { C } from '../theme'

export function Home() {
  const app = useAppState()
  const n = NETWORKS[app.network]
  const [bal, setBal] = useState<Balance[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [v, setV] = useState<NetworkVerification | null>(null)
  useEffect(() => {
    if (!app.active) return
    setErr(null)
    verifyNetwork(n, app.client).then(setV)
    readBalances(app.client, app.active.address, DEFAULT_TOKENS[app.network], n.nativeCurrency)
      .then((r) => setBal(r.balances))
      .catch((e) => setErr((e as Error).message))
  }, [app.active, app.client, app.network])
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={s.mute}>{n.name} · {v?.ok ? `verified chain ${v.chainId}` : v ? 'not verified' : 'checking…'}</Text>
      <Card>
        <Text style={s.mute}>{app.active?.name}</Text>
        <Text style={[s.mono, { color: C.mute }]} onPress={() => app.active && Clipboard.setStringAsync(app.active.address)}>
          {app.active?.address} (tap to copy)
        </Text>
      </Card>
      {err && <Notice tone="bad" text={`Could not read balances: ${err}`} />}
      {bal?.map((b) => (
        <View key={b.symbol} style={[s.card, s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.h2}>{b.symbol}</Text>
          <Text style={s.body}>{Number(formatUnits(b.raw, b.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</Text>
        </View>
      ))}
      <Notice text="InWIF is free. No subscriptions, no paywalls, no InWIF fees — only network gas." />
    </ScrollView>
  )
}
