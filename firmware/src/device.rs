//! Device state machine handling IWDP requests.
//!
//! Mirrors the security behaviour of the companion-side simulator:
//! PIN entered on the device (never over the transport), wipe after 10 failures,
//! physical confirmation for every signature, on-device decoding and a chain
//! allow-list, attestation and signed firmware updates.
use crate::display::{hex_addr, render, Screen};
use crate::keys::{address, derive, keccak256, seed_from_mnemonic, sign_digest, sign_personal_message, sign_transaction};
use crate::protocol::{decode, decode_path, ethereum_index, path_string, response, Cmd, Status};
use crate::tx::parse_eip1559;
use alloc::{format, string::String, vec, vec::Vec};
use k256::ecdsa::SigningKey;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

pub const MAX_PIN_ATTEMPTS: u8 = 10;

/// Board-specific UI: the device screen and its two physical buttons.
pub trait Ui {
    /// Show `screen` and block until the user presses ✓ (true) or ✕ (false).
    fn confirm(&mut self, screen: &Screen) -> bool;
}

pub struct Device<U: Ui> {
    pub ui: U,
    pub serial: String,
    pub firmware: String,
    pub model: String,
    pub allowed_chain_ids: Vec<u64>,
    seed: Option<Zeroizing<[u8; 64]>>,
    pin_hash: Option<[u8; 32]>,
    locked: bool,
    attempts_left: u8,
    attestation_key: SigningKey,
    attestation_cert: [u8; 65],
    vendor_root: [u8; 20],
}

/// Publicly known DEVELOPMENT vendor root (same as the companion's dev root).
/// Production devices are provisioned at the factory with an HSM-held root instead.
pub fn dev_vendor_key() -> SigningKey {
    SigningKey::from_bytes(&keccak256(b"InWIF development vendor root - NOT FOR PRODUCTION").into()).expect("valid key")
}

fn rsy(digest: &[u8; 32], key: &SigningKey) -> [u8; 65] {
    let (y, r, s) = sign_digest(key, digest).expect("sign");
    let mut out = [0u8; 65];
    out[..32].copy_from_slice(&r);
    out[32..64].copy_from_slice(&s);
    out[64] = y;
    out
}

pub fn cert_digest(attestation_addr: &[u8; 20], serial: &str) -> [u8; 32] {
    let mut m = Vec::new();
    m.extend_from_slice(b"InWIF-attestation-cert-v1");
    m.extend_from_slice(attestation_addr);
    m.extend_from_slice(serial.as_bytes());
    keccak256(&m)
}

pub fn attest_digest(challenge: &[u8], serial: &str) -> [u8; 32] {
    let mut m = Vec::new();
    m.extend_from_slice(b"InWIF-attest-v1");
    m.extend_from_slice(challenge);
    m.extend_from_slice(serial.as_bytes());
    keccak256(&m)
}

pub fn firmware_digest(version: &str, image_hash: &[u8; 32]) -> [u8; 32] {
    let mut m = Vec::new();
    m.extend_from_slice(b"InWIF-fw-v1");
    m.extend_from_slice(version.as_bytes());
    m.extend_from_slice(image_hash);
    keccak256(&m)
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.strip_prefix("0x")?;
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

fn hex(b: &[u8]) -> String {
    let mut s = String::from("0x");
    for x in b {
        s.push_str(&format!("{:02x}", x));
    }
    s
}

/// Extract a string field from a flat JSON object (firmware package). Strict and minimal.
fn json_str<'a>(json: &'a str, key: &str) -> Option<&'a str> {
    let pat = format!("\"{}\":\"", key);
    let start = json.find(&pat)? + pat.len();
    let end = json[start..].find('"')? + start;
    let v = &json[start..end];
    if v.contains('\\') {
        return None;
    }
    Some(v)
}

impl<U: Ui> Device<U> {
    /// A development device: self-provisions an attestation certificate with the dev root.
    pub fn new_dev(ui: U, serial: &str, attestation_secret: [u8; 32]) -> Self {
        let attestation_key = SigningKey::from_bytes(&attestation_secret.into()).expect("valid attestation key");
        let vendor = dev_vendor_key();
        let att_addr = address(attestation_key.verifying_key());
        let attestation_cert = rsy(&cert_digest(&att_addr, serial), &vendor);
        Device {
            ui,
            serial: String::from(serial),
            firmware: String::from("0.1.0-dev"),
            model: String::from("InWIF One (dev board)"),
            allowed_chain_ids: vec![4663, 31337],
            seed: None,
            pin_hash: None,
            locked: true,
            attempts_left: MAX_PIN_ATTEMPTS,
            attestation_key,
            attestation_cert,
            vendor_root: address(vendor.verifying_key()),
        }
    }

    fn pin_digest(&self, pin: &str) -> [u8; 32] {
        let mut h = Sha256::new();
        h.update(self.serial.as_bytes());
        h.update(b":");
        h.update(pin.as_bytes());
        h.finalize().into()
    }

    /// Restore from a phrase typed on the device. PIN must be 6–8 digits.
    pub fn restore(&mut self, phrase: &str, pin: &str) -> Result<(), &'static str> {
        if pin.len() < 6 || pin.len() > 8 || !pin.bytes().all(|b| b.is_ascii_digit()) {
            return Err("PIN must be 6-8 digits");
        }
        let words = phrase.split_whitespace().count();
        if ![12, 15, 18, 21, 24].contains(&words) {
            return Err("invalid word count");
        }
        let normalised = phrase.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
        self.seed = Some(seed_from_mnemonic(&normalised, ""));
        self.pin_hash = Some(self.pin_digest(pin));
        self.locked = false;
        self.attempts_left = MAX_PIN_ATTEMPTS;
        Ok(())
    }

    pub fn unlock(&mut self, pin: &str) -> bool {
        let Some(expected) = self.pin_hash else { return false };
        if bool::from(self.pin_digest(pin).ct_eq(&expected)) {
            self.locked = false;
            self.attempts_left = MAX_PIN_ATTEMPTS;
            return true;
        }
        self.attempts_left = self.attempts_left.saturating_sub(1);
        if self.attempts_left == 0 {
            self.wipe();
        }
        false
    }

    pub fn lock(&mut self) {
        self.locked = true;
    }

    pub fn wipe(&mut self) {
        self.seed = None; // Zeroizing clears the old seed on drop
        self.pin_hash = None;
        self.locked = true;
        self.attempts_left = 0;
    }

    pub fn is_initialized(&self) -> bool {
        self.seed.is_some()
    }

    fn key_for(&self, path: &[u32]) -> Option<SigningKey> {
        ethereum_index(path)?;
        derive(self.seed.as_ref()?, path).ok()
    }

    /// Handle one request frame and return the response frame.
    pub fn handle(&mut self, request: &[u8]) -> Vec<u8> {
        let Ok(frame) = decode(request) else { return response(Status::BadRequest, &[]) };
        let Some(cmd) = Cmd::from_u8(frame.code) else { return response(Status::Unsupported, &[]) };
        let p = frame.payload;
        match cmd {
            Cmd::GetInfo => {
                let att = hex_addr(&address(self.attestation_key.verifying_key()));
                let chains = self.allowed_chain_ids.iter().map(|c| format!("{}", c)).collect::<Vec<_>>().join(",");
                let json = format!(
                    "{{\"model\":\"{}\",\"firmware\":\"{}\",\"serial\":\"{}\",\"initialized\":{},\"locked\":{},\"attestationKey\":\"{}\",\"attestationCert\":\"{}\",\"allowedChainIds\":[{}],\"simulated\":false}}",
                    self.model, self.firmware, self.serial, self.seed.is_some(), self.locked, att, hex(&self.attestation_cert), chains
                );
                response(Status::Ok, json.as_bytes())
            }
            Cmd::Attest => {
                if p.len() != 32 {
                    return response(Status::BadRequest, &[]);
                }
                response(Status::Ok, &rsy(&attest_digest(p, &self.serial), &self.attestation_key))
            }
            Cmd::FirmwareUpdate => self.firmware_update(p),
            _ if self.seed.is_none() => response(Status::NotInitialized, &[]),
            _ if self.locked => response(Status::Locked, &[]),
            Cmd::GetAddress => {
                let Some((path, rest)) = decode_path(p) else { return response(Status::BadRequest, &[]) };
                let Some(key) = self.key_for(&path) else { return response(Status::BadRequest, &[]) };
                let addr = address(key.verifying_key());
                if rest.first() == Some(&1) {
                    let screen = Screen {
                        title: String::from("Verify address"),
                        lines: vec![(String::from("Address"), hex_addr(&addr)), (String::from("Path"), path_string(&path))],
                        warnings: vec![String::from("Check this matches the address shown in the app.")],
                    };
                    if !self.ui.confirm(&screen) {
                        return response(Status::UserRejected, &[]);
                    }
                }
                response(Status::Ok, &addr)
            }
            Cmd::SignTx => {
                let Some((path, unsigned)) = decode_path(p) else { return response(Status::BadRequest, &[]) };
                let Ok(tx) = parse_eip1559(unsigned) else { return response(Status::BadRequest, &[]) };
                if !self.allowed_chain_ids.contains(&tx.chain_id) {
                    return response(Status::ChainNotAllowed, &[]);
                }
                let Some(key) = self.key_for(&path) else { return response(Status::BadRequest, &[]) };
                if !self.ui.confirm(&render(&tx)) {
                    return response(Status::UserRejected, &[]);
                }
                match sign_transaction(&key, unsigned) {
                    Ok(sig) => response(Status::Ok, &sig),
                    Err(_) => response(Status::BadRequest, &[]),
                }
            }
            Cmd::SignMessage => {
                let Some((path, msg)) = decode_path(p) else { return response(Status::BadRequest, &[]) };
                let Some(key) = self.key_for(&path) else { return response(Status::BadRequest, &[]) };
                let text = core::str::from_utf8(msg).map(String::from).unwrap_or_else(|_| hex(msg));
                let screen = Screen {
                    title: String::from("Sign message"),
                    lines: vec![(String::from("Account"), hex_addr(&address(key.verifying_key()))), (String::from("Message"), text)],
                    warnings: vec![String::from("Only sign messages from applications you trust.")],
                };
                if !self.ui.confirm(&screen) {
                    return response(Status::UserRejected, &[]);
                }
                match sign_personal_message(&key, msg) {
                    Ok(sig) => response(Status::Ok, &sig),
                    Err(_) => response(Status::BadRequest, &[]),
                }
            }
        }
    }

    fn firmware_update(&mut self, payload: &[u8]) -> Vec<u8> {
        let Ok(json) = core::str::from_utf8(payload) else { return response(Status::BadRequest, &[]) };
        let (Some(version), Some(image_hash), Some(sig)) = (json_str(json, "version"), json_str(json, "imageHash"), json_str(json, "signature")) else {
            return response(Status::BadRequest, &[]);
        };
        let (Some(ih), Some(sig)) = (hex_decode(image_hash), hex_decode(sig)) else { return response(Status::BadRequest, &[]) };
        if ih.len() != 32 || sig.len() != 65 || version.len() > 32 {
            return response(Status::BadRequest, &[]);
        }
        let ih: [u8; 32] = ih.try_into().unwrap();
        let digest = firmware_digest(version, &ih);
        let Ok(signature) = k256::ecdsa::Signature::from_slice(&sig[..64]) else { return response(Status::BadSignature, &[]) };
        let Some(rec) = k256::ecdsa::RecoveryId::from_byte(sig[64]) else { return response(Status::BadSignature, &[]) };
        let Ok(vk) = k256::ecdsa::VerifyingKey::recover_from_prehash(&digest, &signature, rec) else { return response(Status::BadSignature, &[]) };
        if address(&vk) != self.vendor_root {
            return response(Status::BadSignature, &[]);
        }
        let screen = Screen {
            title: String::from("Install firmware?"),
            lines: vec![(String::from("Current"), self.firmware.clone()), (String::from("New"), String::from(version))],
            warnings: vec![String::from("Signed by the DEVELOPMENT key - not a production release.")],
        };
        if !self.ui.confirm(&screen) {
            return response(Status::UserRejected, &[]);
        }
        // A real bootloader would now verify the image hash while flashing and reboot.
        self.firmware = String::from(version);
        response(Status::Ok, &[])
    }
}
