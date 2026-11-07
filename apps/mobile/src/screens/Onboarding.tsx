import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { checkMnemonic, createMnemonic, normaliseMnemonic, pickVerificationIndices, verifyBackupWords } from '@inwif/core'
import { useAppState } from '../state'
import { biometricsAvailable } from '../secure'
import { Button, Card, Field, Notice, s } from '../ui'
import { C } from '../theme'

export function Onboarding() {
  const app = useAppState()
  const [step, setStep] = useState<'welcome' | 'show' | 'verify' | 'import'>('welcome')
  const [phrase, setPhrase] = useState('')
  const [quiz, setQuiz] = useState<number[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const words = useMemo(() => phrase.split(' '), [phrase])

  async function finish(p: string, backedUp: boolean) {
    if (!(await biometricsAvailable())) setErr('Set up Face ID / fingerprint or a device passcode first: InWIF stores keys in the OS keychain behind it.')
    try {
      await app.addFromPhrase('Main wallet', p, backedUp)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingTop: 70 }} style={{ backgroundColor: C.bg }}>
      {step === 'welcome' && (
        <>
          <Text style={s.h1}>
            Your keys. <Text style={{ color: C.lime }}>Your InWIF.</Text>
          </Text>
          <Text style={s.mute}>Free, self-custody wallet for Robinhood Chain. Keys are stored in your phone&apos;s secure keychain and unlocked with Face ID or fingerprint.</Text>
          <Button
            title="Create wallet"
            onPress={() => {
              setPhrase(createMnemonic(128))
              setStep('show')
            }}
          />
          <Button title="Import recovery phrase" kind="ghost" onPress={() => setStep('import')} />
        </>
      )}
      {step === 'show' && (
        <>
          <Text style={s.h2}>Write these {words.length} words down</Text>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {words.map((w, i) => (
                <Text key={i} style={[s.body, { width: '45%' }]}>
                  <Text style={s.mute}>{i + 1}. </Text>
                  {w}
                </Text>
              ))}
            </View>
          </Card>
          <Notice tone="warn" text="Anyone with these words controls your funds. InWIF can never recover them for you." />
          <Button
            title="I wrote it down"
            onPress={() => {
              setQuiz(pickVerificationIndices(words.length, 3))
              setStep('verify')
            }}
          />
        </>
      )}
      {step === 'verify' && (
        <>
          <Text style={s.h2}>Verify your backup</Text>
          {quiz.map((i) => (
            <Field key={i} label={`Word #${i + 1}`} value={answers[i] ?? ''} onChangeText={(t) => setAnswers({ ...answers, [i]: t })} />
          ))}
          {err && <Notice tone="bad" text={err} />}
          <Button title="Verify & secure with biometrics" onPress={() => (verifyBackupWords(phrase, answers, quiz) ? finish(phrase, true) : setErr('Words do not match.'))} />
        </>
      )}
      {step === 'import' && (
        <>
          <Text style={s.h2}>Import recovery phrase</Text>
          <Field label="Recovery phrase" multiline value={input} onChangeText={setInput} style={{ minHeight: 100 }} />
          {!!input && <Text style={{ color: checkMnemonic(input).ok ? C.ok : C.bad }}>{checkMnemonic(input).ok ? 'Valid phrase' : checkMnemonic(input).error}</Text>}
          {err && <Notice tone="bad" text={err} />}
          <Button title="Import" disabled={!checkMnemonic(input).ok} onPress={() => finish(normaliseMnemonic(input), true)} />
          <Button title="Back" kind="ghost" onPress={() => setStep('welcome')} />
        </>
      )}
    </ScrollView>
  )
}
