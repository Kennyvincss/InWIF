import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { C } from './theme'

export const s = StyleSheet.create({
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: C.text, fontSize: 18, fontWeight: '700' },
  body: { color: C.text, fontSize: 15 },
  mute: { color: C.mute, fontSize: 13 },
  mono: { color: C.text, fontFamily: 'Courier', fontSize: 12 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line, gap: 8 },
  input: { backgroundColor: C.bg2, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>
}

export function Button({ title, onPress, kind = 'primary', disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const bg = kind === 'primary' ? C.lime : kind === 'danger' ? C.bad : 'rgba(255,255,255,0.05)'
  const fg = kind === 'primary' ? C.bg : C.text
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => ({ backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: kind === 'ghost' ? 1 : 0, borderColor: C.line })}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Pressable>
  )
}

export function Field(props: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.mute, { textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }]}>{props.label}</Text>
      <TextInput placeholderTextColor={C.mute} autoCapitalize="none" autoCorrect={false} {...props} style={[s.input, props.style]} />
    </View>
  )
}

export function Notice({ text, tone = 'mute' }: { text: string; tone?: 'mute' | 'bad' | 'ok' | 'warn' }) {
  const color = tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.mute
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: color + '55', backgroundColor: color + '14', padding: 12 }}>
      <Text style={{ color, fontSize: 13 }}>{text}</Text>
    </View>
  )
}
