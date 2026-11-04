//! InWIF hardware wallet firmware core.
//!
//! Hardware-independent logic shared by every InWIF device build:
//! the IWDP v1 wire protocol, an EIP-1559 transaction decoder that renders
//! what the user sees on the device screen, and secp256k1 signing.
//!
//! The crate is `no_std` + `alloc` so it runs on the device MCU; board
//! support (display, buttons, USB CDC, secure element) plugs in through the
//! [`device::Ui`] trait and, in production, a secure-element-backed signer.
//!
//! STATUS: stage-2 prototype. Not audited. Keys are held in MCU RAM in this
//! build; production firmware must keep them inside the secure element.
#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod device;
pub mod display;
pub mod keys;
pub mod protocol;
pub mod rlp;
pub mod tx;
