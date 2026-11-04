# InWIF One — hardware architecture (prototype)

> Concept/prototype. Nothing here describes a manufactured or independently tested device.

## Block diagram

```
 USB-C ──► Application MCU (display, buttons, USB CDC, IWDP parser, tx renderer)
              │  I²C / SPI (encrypted, authenticated session)
              ▼
         Secure element (seed storage, BIP-32 derivation, ECDSA signing, PIN counter, attestation key)
```

## Component candidates (selection pending evaluation)

| Function | Candidates | Notes |
|---|---|---|
| Secure element | Infineon OPTIGA Trust M, NXP SE050, Microchip ATECC608B | CC EAL6+ / FIPS; check secp256k1 + BIP-32 support or host-side derivation inside SE session |
| MCU | RP2040 (dev), STM32U5 / nRF5340 (production, TrustZone) | dev board uses the placeholder USB IDs in `webserial.ts` |
| Display | 1.3–2" monochrome OLED or e-paper | must render full addresses |
| Input | 2 physical buttons | no touch for confirmation |
| Power | USB-powered; optional Li-Po | battery reported via GET_INFO |
| Enclosure | CNC aluminium | tamper-evident seal |

## Secure boot & firmware authentication
- **Boot ROM.** The boot ROM / first-stage bootloader verifies the vendor signature over the image hash before jumping to the application.
- **No downgrades.** The version counter is stored in OTP / the SE monotonic counter, so older images are refused.
- **Updates.** Update packages use the IWDP `FIRMWARE_UPDATE` format and are confirmed on the device.

## Development stages

| Stage | Scope | Status |
|---|---|---|
| 1 | Architecture, protocol, simulator, companion | done |
| 2 | Secure signing prototype: `firmware/` core, dev-board bring-up | in progress (core done) |
| 3 | Custom PCB, SE integration, secure boot | planned |
| 4 | Independent security testing (firmware review, fault injection, side channels) | planned |
| 5 | Production enclosure and factory attestation provisioning | planned |

## What is still required (honest list)
- **Hardware.** Physical dev boards (e.g. Raspberry Pi Pico) and a board-support crate that implements the `Ui` trait
  (display and buttons) plus a USB CDC loop that calls `Device::handle`.
- **Secure element.** Integration that keeps the seed and signing inside the SE. The current core holds keys in MCU RAM.
- **Vendor root key.** A production vendor root held in an HSM, plus a manufacturing provisioning process.
- **Independent review.** A third-party hardware security lab engagement.
