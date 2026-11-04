import { useEffect, useState } from 'react'
import { ScrollView, Text } from 'react-native'
import { erc20Abi, formatUnits } from 'viem'
import { NETWORKS, WIF_ADDRESS, getPublicClient, readTokenMetadata, type OnchainTokenMetadata } from '@inwif/core'
import { useAppState } from '../state'
import { Card, Notice, s } from '../ui'
import { C } from '../theme'

export function Wif() {
  const app = useAppState()
  const [meta, setMeta] = useState<OnchainTokenMetadata | null>(null)
  const [bal, setBal] = useState<bigint | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const client = getPublicClient(NETWORKS.robinhood) // $WIF lives on mainnet
    readTokenMetadata(client, WIF_ADDRESS).then(setMeta).catch((e) => setErr((e as Error).message))
    if (app.active) client.readContract({ address: WIF_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [app.active.address] }).then(setBal).catch(() => {})
  }, [app.active])
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={s.h1}>
        <Text style={{ color: C.lime }}>$WIF</Text> ecosystem
      </Text>
      <Card>
        <Text style={s.mute}>Your balance</Text>
        <Text style={s.h1}>{bal !== null && meta ? Number(formatUnits(bal, meta.decimals)).toLocaleString() : '—'} WIF</Text>
      </Card>
      <Card>
        <Text style={s.mute}>Contract (read on-chain)</Text>
        <Text style={s.mono}>{WIF_ADDRESS}</Text>
        <Text style={s.body}>{meta ? `${meta.name} · ${meta.symbol} · ${meta.decimals} decimals` : err ? `Unavailable: ${err}` : 'Loading…'}</Text>
      </Card>
      <Notice tone="ok" text="Powered by the World Is Flat ecosystem. You never need $WIF to use any InWIF feature." />
    </ScrollView>
  )
}
