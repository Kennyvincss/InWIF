//! IWDP v1 framing. See docs/hardware/protocol.md.
//!
//! Request:  'I' 'W' | ver | cmd    | len (u16 BE) | payload
//! Response: 'I' 'W' | ver | status | len (u16 BE) | payload
use alloc::{string::String, vec::Vec};

pub const MAGIC: [u8; 2] = [0x49, 0x57];
pub const VERSION: u8 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Cmd {
    GetInfo = 0x01,
    GetAddress = 0x03,
    SignTx = 0x04,
    SignMessage = 0x05,
    Attest = 0x06,
    FirmwareUpdate = 0x07,
}

impl Cmd {
    pub fn from_u8(v: u8) -> Option<Self> {
        Some(match v {
            0x01 => Cmd::GetInfo,
            0x03 => Cmd::GetAddress,
            0x04 => Cmd::SignTx,
            0x05 => Cmd::SignMessage,
            0x06 => Cmd::Attest,
            0x07 => Cmd::FirmwareUpdate,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Status {
    Ok = 0x00,
    UserRejected = 0x01,
    Locked = 0x02,
    BadRequest = 0x03,
    Unsupported = 0x04,
    ChainNotAllowed = 0x05,
    Busy = 0x06,
    BadSignature = 0x07,
    NotInitialized = 0x08,
}

#[derive(Debug, PartialEq, Eq)]
pub enum FrameError {
    TooShort,
    BadMagic,
    BadVersion,
    LengthMismatch,
    TooLarge,
}

pub struct Frame<'a> {
    pub code: u8,
    pub payload: &'a [u8],
}

pub fn decode(bytes: &[u8]) -> Result<Frame<'_>, FrameError> {
    if bytes.len() < 6 {
        return Err(FrameError::TooShort);
    }
    if bytes[0..2] != MAGIC {
        return Err(FrameError::BadMagic);
    }
    if bytes[2] != VERSION {
        return Err(FrameError::BadVersion);
    }
    let len = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
    if bytes.len() != 6 + len {
        return Err(FrameError::LengthMismatch);
    }
    Ok(Frame { code: bytes[3], payload: &bytes[6..] })
}

pub fn encode(code: u8, payload: &[u8]) -> Result<Vec<u8>, FrameError> {
    if payload.len() > u16::MAX as usize {
        return Err(FrameError::TooLarge);
    }
    let mut out = Vec::with_capacity(6 + payload.len());
    out.extend_from_slice(&MAGIC);
    out.push(VERSION);
    out.push(code);
    out.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    out.extend_from_slice(payload);
    Ok(out)
}

pub fn response(status: Status, payload: &[u8]) -> Vec<u8> {
    encode(status as u8, payload).unwrap_or_else(|_| encode(Status::BadRequest as u8, &[]).unwrap())
}

pub const HARDENED: u32 = 0x8000_0000;

/// Decode `count(u8) || count × u32 BE` and return (components, rest).
pub fn decode_path(bytes: &[u8]) -> Option<(Vec<u32>, &[u8])> {
    let n = *bytes.first()? as usize;
    if n > 10 || bytes.len() < 1 + n * 4 {
        return None;
    }
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let o = 1 + i * 4;
        out.push(u32::from_be_bytes([bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]]));
    }
    Some((out, &bytes[1 + n * 4..]))
}

/// Only standard Ethereum account paths m/44'/60'/0'/0/i are accepted by policy.
pub fn ethereum_index(path: &[u32]) -> Option<u32> {
    match path {
        [a, b, c, 0, i] if *a == 44 | HARDENED && *b == 60 | HARDENED && *c == HARDENED && *i < HARDENED => Some(*i),
        _ => None,
    }
}

pub fn path_string(path: &[u32]) -> String {
    let mut s = String::from("m");
    for p in path {
        s.push('/');
        if p & HARDENED != 0 {
            s.push_str(&alloc::format!("{}'", p & !HARDENED));
        } else {
            s.push_str(&alloc::format!("{}", p));
        }
    }
    s
}
