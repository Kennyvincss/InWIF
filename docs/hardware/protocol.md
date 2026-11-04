# InWIF Device Protocol (IWDP) v1

Transport-independent request/response framing used by companion apps and InWIF devices (USB-C CDC
serial today; BLE later). Reference implementations:
- `packages/core/src/hardware/protocol.ts`: companion side and browser simulator
- `firmware/src/protocol.rs`: device side

## Frames

```
Request : 0x49 'I' | 0x57 'W' | version=0x01 | cmd    | len (u16 big-endian) | payload[len]
Response: 0x49 'I' | 0x57 'W' | version=0x01 | status | len (u16 big-endian) | payload[len]
```

One request is in flight at a time; a device receiving a request while busy answers `BUSY`.

## BIP-32 path encoding

`count (u8) || count × u32 big-endian`, with the hardened bit `0x80000000`. Devices only accept the standard
Ethereum account branch `m/44'/60'/0'/0/i` (policy).

## Commands

| Code | Name | Request payload | OK response payload | User confirmation |
|---|---|---|---|---|
| 0x01 | GET_INFO | — | UTF-8 JSON `DeviceInfo` | no |
| 0x03 | GET_ADDRESS | path ‖ display(u8: 0/1) | 20-byte address | if display=1 |
| 0x04 | SIGN_TX | path ‖ unsigned EIP-1559 tx (`0x02 ‖ rlp([...])`) | `yParity ‖ r ‖ s` (65 B) | **always** |
| 0x05 | SIGN_MESSAGE | path ‖ message bytes | EIP-191 `r ‖ s ‖ v` (65 B) | **always** |
| 0x06 | ATTEST | 32-byte random challenge | `r ‖ s ‖ yParity` over `keccak("InWIF-attest-v1" ‖ challenge ‖ serial)` | no |
| 0x07 | FIRMWARE_UPDATE | UTF-8 JSON `{version, imageHash, signature}` | — | **always** |

`DeviceInfo` fields:

| Field | Type |
|---|---|
| `model`, `firmware`, `serial` | string |
| `initialized`, `locked`, `simulated` | bool |
| `attestationKey` | address |
| `attestationCert` | 65-byte hex |
| `allowedChainIds` | number[] |
| `batteryPct` | number, optional |

## Status codes

| Code | Name |
|---|---|
| 0x00 | OK |
| 0x01 | USER_REJECTED |
| 0x02 | LOCKED (enter PIN on device) |
| 0x03 | BAD_REQUEST |
| 0x04 | UNSUPPORTED |
| 0x05 | CHAIN_NOT_ALLOWED |
| 0x06 | BUSY |
| 0x07 | BAD_SIGNATURE (firmware / attestation) |
| 0x08 | NOT_INITIALIZED |

## Security rules (normative)
1. **PIN on the device.** The PIN is never transmitted. The device wipes its seed after 10 consecutive wrong PINs.
2. **Decode on the device.** SIGN_TX payloads are decoded by the device, which renders the recipient, amount
   (known tokens labelled), approvals (UNLIMITED flagged), chain, max fee and nonce from the bytes it will sign.
   - Transactions with non-empty access lists are refused until the device can display them.
3. **Chain allow-list.** The device refuses chains outside its allow-list (`CHAIN_NOT_ALLOWED`).
4. **Signature check before broadcast.** The companion verifies the returned signature recovers to the expected
   account before broadcasting (`HardwareWallet.signTransaction`).
5. **Attestation.** `attestationCert` is a vendor-root signature over
   `keccak("InWIF-attestation-cert-v1" ‖ attestationKey ‖ serial)`. The companion checks the cert *and* a fresh
   ATTEST challenge. The public development root is never reported as "genuine".
6. **Signed firmware.** Firmware packages are accepted only if signed by a trusted vendor root over
   `keccak("InWIF-fw-v1" ‖ version ‖ imageHash)`.

## Compatibility test vectors
`firmware/tests/device.rs` contains request/response frames produced by the TypeScript simulator. The Rust
device must reproduce them byte for byte; deterministic RFC 6979 signatures make this possible.
