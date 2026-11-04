import { describe, expect, it } from 'vitest'
import { keccak256, parseEther, parseTransaction, recoverTransactionAddress, stringToBytes, verifyMessage } from 'viem'
import {
  Cmd,
  DeviceError,
  HardwareWallet,
  SimulatedDevice,
  SimulatorTransport,
  Status,
  decodeFrame,
  decodePath,
  devSignFirmware,
  encodePath,
  encodeRequest,
  verifyFirmwarePackage,
  type DevicePrompt,
} from '../src'

const ANVIL = 'test test test test test test test test test test test junk'
const ADDR0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

function setup(approve = true) {
  const prompts: DevicePrompt[] = []
  let shown: string[] = []
  const device = new SimulatedDevice({
    confirm: async (p) => {
      prompts.push(p)
      return approve
    },
    showRecoveryPhrase: (w) => (shown = w),
  })
  const hw = new HardwareWallet(new SimulatorTransport(device))
  return { device, hw, prompts, shown: () => shown }
}

const tx = {
  type: 'eip1559' as const,
  chainId: 4663,
  nonce: 0,
  to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
  value: parseEther('0.01'),
  gas: 21000n,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
}

describe('IWDP protocol codec', () => {
  it('round-trips paths and frames', () => {
    const p = encodePath("m/44'/60'/0'/0/7")
    expect(decodePath(p).path).toBe("m/44'/60'/0'/0/7")
    const f = decodeFrame(encodeRequest(Cmd.GetInfo, new Uint8Array([1, 2, 3])))
    expect(f.code).toBe(Cmd.GetInfo)
    expect([...f.payload]).toEqual([1, 2, 3])
  })
  it('rejects malformed frames', () => {
    expect(() => decodeFrame(new Uint8Array([0, 0, 1, 1, 0, 0]))).toThrow()
    expect(() => decodeFrame(new Uint8Array([0x49, 0x57, 1, 1, 0, 5]))).toThrow()
  })
})

describe('simulated hardware wallet', () => {
  it('requires initialisation and unlock on-device', async () => {
    const { device, hw } = setup()
    await expect(hw.getAddress(0)).rejects.toMatchObject({ status: Status.NotInitialized })
    device.restore(ANVIL, '123456')
    device.lock()
    await expect(hw.getAddress(0)).rejects.toMatchObject({ status: Status.Locked })
    expect(device.unlock('000000')).toBe(false)
    expect(device.unlock('123456')).toBe(true)
    expect(await hw.getAddress(0)).toBe(ADDR0)
  })

  it('shows a newly generated seed only on the device screen', async () => {
    const { device, hw, shown } = setup()
    device.setupNew('654321')
    expect(shown()).toHaveLength(24)
    const info = await hw.getInfo()
    expect(JSON.stringify(info)).not.toContain(shown()[0]! + ' ' + shown()[1]!)
  })

  it('wipes after 10 wrong PINs', () => {
    const { device } = setup()
    device.restore(ANVIL, '123456')
    device.lock()
    for (let i = 0; i < 10; i++) device.unlock('999999')
    expect(device.state.initialized).toBe(false)
  })

  it('signs offline after on-device confirmation, displaying decoded details', async () => {
    const { device, hw, prompts } = setup(true)
    device.restore(ANVIL, '123456')
    const signed = await hw.signTransaction(tx, 0, ADDR0)
    const parsed = parseTransaction(signed)
    expect(parsed.to?.toLowerCase()).toBe(tx.to.toLowerCase())
    expect(await recoverTransactionAddress({ serializedTransaction: signed as `0x02${string}` })).toBe(ADDR0)
    expect(prompts[0]!.kind).toBe('sign-tx')
    expect(prompts[0]!.lines.some((l) => l.value.includes('0.01 ETH'))).toBe(true)
  })

  it('returns UserRejected when the user presses reject', async () => {
    const { device, hw } = setup(false)
    device.restore(ANVIL, '123456')
    await expect(hw.signTransaction(tx, 0, ADDR0)).rejects.toBeInstanceOf(DeviceError)
  })

  it('refuses to accept a signature for an unexpected account', async () => {
    const { device, hw } = setup(true)
    device.restore(ANVIL, '123456')
    await expect(hw.signTransaction(tx, 1, ADDR0)).rejects.toThrow(/does not match/)
  })

  it('enforces the on-device chain allow-list', async () => {
    const { device, hw } = setup(true)
    device.restore(ANVIL, '123456')
    await expect(hw.signTransaction({ ...tx, chainId: 1 }, 0, ADDR0)).rejects.toMatchObject({ status: Status.ChainNotAllowed })
  })

  it('signs personal messages', async () => {
    const { device, hw } = setup(true)
    device.restore(ANVIL, '123456')
    const sig = await hw.signMessage('hello InWIF', 0)
    expect(await verifyMessage({ address: ADDR0, message: 'hello InWIF', signature: sig })).toBe(true)
  })

  it('passes challenge-response authenticity as a development device', async () => {
    const { hw } = setup()
    const r = await hw.verifyAuthenticity()
    expect(r.genuine).toBe(false) // dev root is never "genuine production"
    expect(r.vendorLabel).toMatch(/development/)
    expect(r.reason).toMatch(/Development device/)
  })

  it('only installs firmware signed by a trusted vendor key', async () => {
    const { hw, device } = setup(true)
    const image = stringToBytes('firmware image v0.2.0')
    const pkg = await devSignFirmware('0.2.0-sim', image)
    expect((await verifyFirmwarePackage(pkg, image)).ok).toBe(true)
    expect((await verifyFirmwarePackage(pkg, stringToBytes('tampered'))).ok).toBe(false)
    await hw.updateFirmware(pkg)
    expect(device.state.firmware).toBe('0.2.0-sim')
    const forged = { ...pkg, version: '9.9.9', imageHash: keccak256(stringToBytes('evil')) }
    await expect(hw.updateFirmware(forged)).rejects.toMatchObject({ status: Status.BadSignature })
  })
})
