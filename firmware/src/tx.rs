//! EIP-1559 transaction parsing and action decoding, done ON the device so the
//! companion app cannot misrepresent what is being signed.
use crate::rlp::{decode_exact, Item};
use alloc::vec::Vec;

pub type U256 = [u8; 32]; // big-endian

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Eip1559Tx {
    pub chain_id: u64,
    pub nonce: u64,
    pub max_priority_fee_per_gas: U256,
    pub max_fee_per_gas: U256,
    pub gas: u64,
    pub to: Option<[u8; 20]>,
    pub value: U256,
    pub data: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TxError {
    NotEip1559,
    Malformed,
    Overflow,
    AccessListUnsupported,
}

fn uint<const N: usize>(it: &Item) -> Result<[u8; N], TxError> {
    match it {
        Item::Bytes(b) => {
            if b.len() > N {
                return Err(TxError::Overflow);
            }
            if !b.is_empty() && b[0] == 0 {
                return Err(TxError::Malformed); // leading zero = non-canonical
            }
            let mut out = [0u8; N];
            out[N - b.len()..].copy_from_slice(b);
            Ok(out)
        }
        _ => Err(TxError::Malformed),
    }
}

fn u64_of(it: &Item) -> Result<u64, TxError> {
    Ok(u64::from_be_bytes(uint::<8>(it)?))
}

/// Parse an unsigned EIP-1559 transaction: `0x02 || rlp([chainId, nonce, maxPriorityFeePerGas,
/// maxFeePerGas, gas, to, value, data, accessList])`.
pub fn parse_eip1559(bytes: &[u8]) -> Result<Eip1559Tx, TxError> {
    if bytes.first() != Some(&0x02) {
        return Err(TxError::NotEip1559);
    }
    let fields = match decode_exact(&bytes[1..]).map_err(|_| TxError::Malformed)? {
        Item::List(f) if f.len() == 9 => f,
        _ => return Err(TxError::Malformed),
    };
    let to = match &fields[5] {
        Item::Bytes(b) if b.is_empty() => None,
        Item::Bytes(b) if b.len() == 20 => {
            let mut a = [0u8; 20];
            a.copy_from_slice(b);
            Some(a)
        }
        _ => return Err(TxError::Malformed),
    };
    let data = match &fields[7] {
        Item::Bytes(b) => b.to_vec(),
        _ => return Err(TxError::Malformed),
    };
    match &fields[8] {
        Item::List(l) if l.is_empty() => {}
        // Access lists change what the tx touches; refuse until the device can display them.
        Item::List(_) => return Err(TxError::AccessListUnsupported),
        _ => return Err(TxError::Malformed),
    }
    Ok(Eip1559Tx {
        chain_id: u64_of(&fields[0])?,
        nonce: u64_of(&fields[1])?,
        max_priority_fee_per_gas: uint::<32>(&fields[2])?,
        max_fee_per_gas: uint::<32>(&fields[3])?,
        gas: u64_of(&fields[4])?,
        to,
        value: uint::<32>(&fields[6])?,
        data,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    NativeTransfer { to: [u8; 20], value: U256 },
    TokenTransfer { token: [u8; 20], to: [u8; 20], amount: U256 },
    TokenApprove { token: [u8; 20], spender: [u8; 20], amount: U256, unlimited: bool },
    ContractCall { to: [u8; 20], selector: [u8; 4], value: U256 },
    Deploy,
}

const TRANSFER: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];
const APPROVE: [u8; 4] = [0x09, 0x5e, 0xa7, 0xb3];

fn word_addr(w: &[u8]) -> Option<[u8; 20]> {
    if w.len() != 32 || w[..12].iter().any(|b| *b != 0) {
        return None;
    }
    let mut a = [0u8; 20];
    a.copy_from_slice(&w[12..]);
    Some(a)
}

pub fn decode_action(tx: &Eip1559Tx) -> Action {
    let Some(to) = tx.to else { return Action::Deploy };
    if tx.data.is_empty() {
        return Action::NativeTransfer { to, value: tx.value };
    }
    if tx.data.len() == 68 && tx.value == [0u8; 32] {
        let sel: [u8; 4] = tx.data[..4].try_into().unwrap();
        let mut amount = [0u8; 32];
        amount.copy_from_slice(&tx.data[36..68]);
        if let Some(arg) = word_addr(&tx.data[4..36]) {
            if sel == TRANSFER {
                return Action::TokenTransfer { token: to, to: arg, amount };
            }
            if sel == APPROVE {
                // >= 2^255 is treated as unlimited, matching the companion app.
                return Action::TokenApprove { token: to, spender: arg, amount, unlimited: amount[0] >= 0x80 };
            }
        }
    }
    let mut selector = [0u8; 4];
    let n = tx.data.len().min(4);
    selector[..n].copy_from_slice(&tx.data[..n]);
    Action::ContractCall { to, selector, value: tx.value }
}
