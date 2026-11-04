//! Minimal, strict RLP decoder (enough for typed transaction envelopes).
use alloc::vec::Vec;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Item<'a> {
    Bytes(&'a [u8]),
    List(Vec<Item<'a>>),
}

#[derive(Debug, PartialEq, Eq)]
pub struct RlpError;

fn be_len(b: &[u8]) -> Result<usize, RlpError> {
    if b.is_empty() || b.len() > 4 || b[0] == 0 {
        return Err(RlpError); // non-canonical or absurd length
    }
    Ok(b.iter().fold(0usize, |acc, x| (acc << 8) | *x as usize))
}

/// Decode one item from the front of `input`, returning it and the bytes consumed.
pub fn decode_item(input: &[u8]) -> Result<(Item<'_>, usize), RlpError> {
    let p = *input.first().ok_or(RlpError)?;
    match p {
        0x00..=0x7f => Ok((Item::Bytes(&input[0..1]), 1)),
        0x80..=0xb7 => {
            let len = (p - 0x80) as usize;
            let data = input.get(1..1 + len).ok_or(RlpError)?;
            if len == 1 && data[0] < 0x80 {
                return Err(RlpError); // non-canonical single byte
            }
            Ok((Item::Bytes(data), 1 + len))
        }
        0xb8..=0xbf => {
            let ll = (p - 0xb7) as usize;
            let len = be_len(input.get(1..1 + ll).ok_or(RlpError)?)?;
            if len < 56 {
                return Err(RlpError);
            }
            let data = input.get(1 + ll..1 + ll + len).ok_or(RlpError)?;
            Ok((Item::Bytes(data), 1 + ll + len))
        }
        0xc0..=0xf7 => {
            let len = (p - 0xc0) as usize;
            let body = input.get(1..1 + len).ok_or(RlpError)?;
            Ok((Item::List(decode_list(body)?), 1 + len))
        }
        0xf8..=0xff => {
            let ll = (p - 0xf7) as usize;
            let len = be_len(input.get(1..1 + ll).ok_or(RlpError)?)?;
            if len < 56 {
                return Err(RlpError);
            }
            let body = input.get(1 + ll..1 + ll + len).ok_or(RlpError)?;
            Ok((Item::List(decode_list(body)?), 1 + ll + len))
        }
    }
}

fn decode_list(mut body: &[u8]) -> Result<Vec<Item<'_>>, RlpError> {
    let mut items = Vec::new();
    while !body.is_empty() {
        let (it, used) = decode_item(body)?;
        items.push(it);
        body = &body[used..];
    }
    Ok(items)
}

/// Decode exactly one item covering the whole input.
pub fn decode_exact(input: &[u8]) -> Result<Item<'_>, RlpError> {
    let (it, used) = decode_item(input)?;
    if used != input.len() {
        return Err(RlpError);
    }
    Ok(it)
}
