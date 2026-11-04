import { ScrollView, Share, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { NETWORKS } from '@inwif/core'
import { useAppState } from '../state'
import { Button, Notice, s } from '../ui'

export function Receive() {
  const app = useAppState()
  const n = NETWORKS[app.network]
  if (!app.active) return null
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, alignItems: 'stretch' }}>
      <Text style={s.h1}>Receive</Text>
      <View style={{ alignSelf: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 18 }}>
        <QRCode value={`ethereum:${app.active.address}@${n.chainId}`} size={220} />
      </View>
      <Text style={[s.mono, { textAlign: 'center' }]}>{app.active.address}</Text>
      <Button title="Share address" onPress={() => Share.share({ message: app.active!.address })} />
      <Notice tone="warn" text={`Only send assets on ${n.name} (chain ${n.chainId}).`} />
    </ScrollView>
  )
}
