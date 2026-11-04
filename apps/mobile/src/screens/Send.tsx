import { useState } from 'react'
import { ScrollView, Text } from 'react-native'
import { formatUnits } from 'viem'
import {
  NETWORKS,
  checkRecipient,
  derivePrivateKey,
  estimateFees,
  parseAmount,
  prepareTransaction,
  reviewTransaction,
  signAndBroadcast,
  simulateTransaction,
  softwareSigner,
  verifyNetwork,
  type FeeEstimate,
  type TxReview,
} from '@inwif/core'
import { useAppState } from '../state'
import { confirmWithBiometrics, readSecret } from '../secure'
import { Button, Card, Field, Notice, s } from '../ui'

export function Send() {
  const app = useAppState()
  const n = NETWORKS[app.network]
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [review, setReview] = useState<{ r: TxReview; fees: FeeEstimate } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const rc = to ? checkRecipient(to, { self: app.active?.address }) : null
  const amt = amount ? parseAmount(amount, 18) : null

  async function prepare() {
    if (!rc?.address || !amt?.raw || !app.active) return
    const req = { from: app.active.address, to: rc.address, value: amt.raw }
    const sim = await simulateTransaction(app.client, req)
    if (!sim.success) return setStatus(`Would fail: ${sim.revertReason}`)
    const fees = await estimateFees(app.client, req)
    const bal = await app.client.getBalance({ address: app.active.address })
    setReview({ r: reviewTransaction({ to: rc.address, value: amt.raw, chainId: n.chainId }, { from: app.active.address, expectedChainId: n.chainId, nativeBalance: bal, maxFeeWei: fees.maxFeeWei }), fees })
  }

  async function send() {
    if (!review || !rc?.address || !amt?.raw || !app.active) return
    if (!(await confirmWithBiometrics('Approve this transaction'))) return setStatus('Cancelled')
    const phrase = await readSecret(app.active.id) // keychain prompt
    if (!phrase) return setStatus('Key not found')
    const signer = softwareSigner(derivePrivateKey(phrase, 0))
    const prepared = await prepareTransaction(app.client, n, app.active.address, { to: rc.address, value: amt.raw, gas: review.fees.gas, maxFeePerGas: review.fees.maxFeePerGas, maxPriorityFeePerGas: review.fees.maxPriorityFeePerGas })
    const hash = await signAndBroadcast(app.client, prepared, signer, { confirmed: true, verification: await verifyNetwork(n, app.client) })
    setStatus(`Broadcast ${hash.slice(0, 18)}… waiting for confirmation`)
    const rcpt = await app.client.waitForTransactionReceipt({ hash })
    setStatus(rcpt.status === 'success' ? `Confirmed in block ${rcpt.blockNumber}` : 'Failed on-chain')
    setReview(null)
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={s.h1}>Send ETH</Text>
      <Field label="Recipient" value={to} onChangeText={setTo} placeholder="0x…" />
      {rc?.findings.filter((f) => f.severity !== 'info').map((f) => <Notice key={f.code} tone={f.severity === 'danger' ? 'bad' : 'warn'} text={f.message} />)}
      <Field label="Amount (ETH)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      {amt && !amt.ok && <Notice tone="bad" text={amt.error!} />}
      {!review ? (
        <Button title="Review" disabled={!rc?.ok || !amt?.ok} onPress={() => prepare().catch((e) => setStatus((e as Error).message))} />
      ) : (
        <Card>
          <Text style={s.h2}>{review.r.title}</Text>
          {review.r.lines.map((l) => (
            <Text key={l.label} style={s.body}>
              <Text style={s.mute}>{l.label}: </Text>
              {l.value}
            </Text>
          ))}
          <Text style={s.mute}>Estimated fee {formatUnits(review.fees.expectedFeeWei, 18)} ETH</Text>
          {review.r.findings.filter((f) => f.severity !== 'info').map((f) => <Notice key={f.code} tone="warn" text={f.message} />)}
          <Button title="Confirm with biometrics" onPress={() => send().catch((e) => setStatus((e as Error).message))} />
          <Button title="Cancel" kind="ghost" onPress={() => setReview(null)} />
        </Card>
      )}
      {status && <Notice text={status} />}
    </ScrollView>
  )
}
