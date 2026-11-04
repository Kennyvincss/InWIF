import { useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { StateProvider, useAppState } from './src/state'
import { Onboarding } from './src/screens/Onboarding'
import { Home } from './src/screens/Home'
import { Send } from './src/screens/Send'
import { Receive } from './src/screens/Receive'
import { Wif } from './src/screens/Wif'
import { Hardware } from './src/screens/Hardware'
import { C } from './src/theme'

const TABS = { Home, Send, Receive, $WIF: Wif, Device: Hardware } as const
type Tab = keyof typeof TABS

function Root() {
  const app = useAppState()
  const [tab, setTab] = useState<Tab>('Home')
  if (!app.ready) return <ActivityIndicator color={C.lime} style={{ flex: 1, backgroundColor: C.bg }} />
  if (!app.wallets.length) return <Onboarding />
  const Screen = TABS[tab]
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>
        <Screen />
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg2 }}>
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Pressable key={t} accessibilityRole="tab" onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: tab === t ? C.lime : C.mute, fontWeight: '700', fontSize: 12 }}>{t}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <StateProvider>
      <StatusBar style="light" />
      <Root />
    </StateProvider>
  )
}
