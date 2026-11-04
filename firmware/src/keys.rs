//! Key derivation and signing, built only from established crates
//! (RustCrypto `k256`, `sha3`, `pbkdf2`, iqlusion `bip32`). No custom crypto.
use alloc::{format, vec::Vec};
use bip32::{ChildNumber, XPrv};
use k256::ecdsa::{SigningKey, VerifyingKey};
use sha3::{Digest, Keccak256};
use zeroize::Zeroizing;

pub fn keccak256(data: &[u8]) -> [u8; 32] {
    Keccak256::digest(data).into()
}

/// BIP-39 seed: PBKDF2-HMAC-SHA512(mnemonic, "mnemonic" || passphrase, 2048).
pub fn seed_from_mnemonic(phrase: &str, passphrase: &str) -> Zeroizing<[u8; 64]> {
    let mut seed = Zeroizing::new([0u8; 64]);
    let salt = Zeroizing::new(format!("mnemonic{}", passphrase));
    pbkdf2::pbkdf2_hmac::<sha2::Sha512>(phrase.as_bytes(), salt.as_bytes(), 2048, seed.as_mut());
    seed
}

#[derive(Debug, PartialEq, Eq)]
pub struct KeyError;

/// Derive the signing key for a BIP-32 path given as raw components.
pub fn derive(seed: &[u8; 64], path: &[u32]) -> Result<SigningKey, KeyError> {
    let mut k = XPrv::new(seed).map_err(|_| KeyError)?;
    for c in path {
        k = k.derive_child(ChildNumber(*c)).map_err(|_| KeyError)?;
    }
    Ok(k.private_key().clone())
}

pub fn address(vk: &VerifyingKey) -> [u8; 20] {
    let p = vk.to_encoded_point(false);
    let h = keccak256(&p.as_bytes()[1..]);
    let mut a = [0u8; 20];
    a.copy_from_slice(&h[12..]);
    a
}

/// Sign a 32-byte digest. Returns (yParity, r, s) with low-S normalisation.
pub fn sign_digest(key: &SigningKey, digest: &[u8; 32]) -> Result<(u8, [u8; 32], [u8; 32]), KeyError> {
    let (sig, rec) = key.sign_prehash_recoverable(digest).map_err(|_| KeyError)?;
    let bytes = sig.to_bytes();
    let mut r = [0u8; 32];
    let mut s = [0u8; 32];
    r.copy_from_slice(&bytes[..32]);
    s.copy_from_slice(&bytes[32..]);
    Ok((rec.to_byte() & 1, r, s))
}

/// Sign an unsigned typed transaction: returns yParity || r || s (65 bytes, IWDP format).
pub fn sign_transaction(key: &SigningKey, unsigned: &[u8]) -> Result<Vec<u8>, KeyError> {
    let (y, r, s) = sign_digest(key, &keccak256(unsigned))?;
    let mut out = Vec::with_capacity(65);
    out.push(y);
    out.extend_from_slice(&r);
    out.extend_from_slice(&s);
    Ok(out)
}

/// EIP-191 personal_sign: returns r || s || v (v = 27 + yParity), matching Ethereum wallets.
pub fn sign_personal_message(key: &SigningKey, msg: &[u8]) -> Result<Vec<u8>, KeyError> {
    let mut pre = Vec::with_capacity(msg.len() + 32);
    pre.extend_from_slice(b"\x19Ethereum Signed Message:\n");
    pre.extend_from_slice(format!("{}", msg.len()).as_bytes());
    pre.extend_from_slice(msg);
    let (y, r, s) = sign_digest(key, &keccak256(&pre))?;
    let mut out = Vec::with_capacity(65);
    out.extend_from_slice(&r);
    out.extend_from_slice(&s);
    out.push(27 + y);
    Ok(out)
}
