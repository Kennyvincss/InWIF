//! Human-readable rendering for the device screen.
use crate::tx::{decode_action, Action, Eip1559Tx, U256};
use alloc::{format, string::String, vec::Vec};

pub struct KnownToken {
    pub address: [u8; 20],
    pub symbol: &'static str,
    pub decimals: u8,
}

const fn h20(s: &[u8; 40]) -> [u8; 20] {
    const fn nib(c: u8) -> u8 {
        match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => panic!("bad hex"),
        }
    }
    let mut out = [0u8; 20];
    let mut i = 0;
    while i < 20 {
        out[i] = (nib(s[2 * i]) << 4) | nib(s[2 * i + 1]);
        i += 1;
    }
    out
}

/// Tokens the device can label itself (Robinhood Chain mainnet). Anything else is shown raw.
pub const KNOWN_TOKENS: &[KnownToken] = &[
    KnownToken { address: h20(b"5173b8eA6923c2d40267890D45C46a3480954773"), symbol: "WIF", decimals: 18 },
    KnownToken { address: h20(b"0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"), symbol: "WETH", decimals: 18 },
    KnownToken { address: h20(b"5fc5360D0400a0Fd4f2af552ADD042D716F1d168"), symbol: "USDG", decimals: 6 },
    KnownToken { address: h20(b"CEC185eB182c47d1bA1EFc84e6959e18cd620Be4"), symbol: "cbBTC", decimals: 8 },
];

pub fn hex_addr(a: &[u8; 20]) -> String {
    let mut s = String::from("0x");
    for b in a {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// U256 (big-endian) to decimal string with `decimals` fractional digits, trailing zeros trimmed.
pub fn format_units(v: &U256, decimals: u8) -> String {
    let mut n = *v;
    let mut digits: Vec<u8> = Vec::new();
    loop {
        let mut rem: u32 = 0;
        let mut zero = true;
        for byte in n.iter_mut() {
            let cur = (rem << 8) | *byte as u32;
            *byte = (cur / 10) as u8;
            rem = cur % 10;
            if *byte != 0 {
                zero = false;
            }
        }
        digits.push(b'0' + rem as u8);
        if zero {
            break;
        }
    }
    while digits.len() <= decimals as usize {
        digits.push(b'0');
    }
    digits.reverse();
    let split = digits.len() - decimals as usize;
    let int = core::str::from_utf8(&digits[..split]).unwrap();
    let frac = core::str::from_utf8(&digits[split..]).unwrap().trim_end_matches('0');
    if frac.is_empty() {
        String::from(int)
    } else {
        format!("{}.{}", int, frac)
    }
}

fn mul_u256_u64(a: &U256, b: u64) -> Option<U256> {
    let mut out = [0u8; 32];
    let mut carry: u128 = 0;
    for i in (0..32).rev() {
        let cur = a[i] as u128 * b as u128 + carry;
        out[i] = (cur & 0xff) as u8;
        carry = cur >> 8;
    }
    if carry != 0 {
        None
    } else {
        Some(out)
    }
}

pub struct Screen {
    pub title: String,
    pub lines: Vec<(String, String)>,
    pub warnings: Vec<String>,
}

fn amount(token: &[u8; 20], v: &U256) -> String {
    match KNOWN_TOKENS.iter().find(|k| &k.address == token) {
        Some(k) => format!("{} {}", format_units(v, k.decimals), k.symbol),
        None => format!("{} base units", format_units(v, 0)),
    }
}

pub fn render(tx: &Eip1559Tx) -> Screen {
    let mut lines = Vec::new();
    let mut warnings = Vec::new();
    lines.push((String::from("Network"), format!("Chain {}", tx.chain_id)));
    let title = match decode_action(tx) {
        Action::NativeTransfer { to, value } => {
            lines.push((String::from("To"), hex_addr(&to)));
            lines.push((String::from("Amount"), format!("{} ETH", format_units(&value, 18))));
            "Send ETH"
        }
        Action::TokenTransfer { token, to, amount: a } => {
            lines.push((String::from("Token"), hex_addr(&token)));
            lines.push((String::from("To"), hex_addr(&to)));
            lines.push((String::from("Amount"), amount(&token, &a)));
            if to == token {
                warnings.push(String::from("Recipient is the token contract itself."));
            }
            "Send token"
        }
        Action::TokenApprove { token, spender, amount: a, unlimited } => {
            lines.push((String::from("Token"), hex_addr(&token)));
            lines.push((String::from("Spender"), hex_addr(&spender)));
            lines.push((String::from("Allowance"), if unlimited { String::from("UNLIMITED") } else { amount(&token, &a) }));
            if unlimited {
                warnings.push(String::from("Unlimited approval: spender can take ALL of this token."));
            }
            if a == [0u8; 32] { "Revoke approval" } else { "Approve spending" }
        }
        Action::ContractCall { to, selector, value } => {
            lines.push((String::from("Contract"), hex_addr(&to)));
            lines.push((String::from("Function"), format!("0x{:02x}{:02x}{:02x}{:02x}", selector[0], selector[1], selector[2], selector[3])));
            if value != [0u8; 32] {
                lines.push((String::from("Value"), format!("{} ETH", format_units(&value, 18))));
            }
            warnings.push(String::from("Contract interaction: only continue if you trust the app."));
            "Contract call"
        }
        Action::Deploy => {
            warnings.push(String::from("Deploys a new contract."));
            "Deploy contract"
        }
    };
    if let Some(fee) = mul_u256_u64(&tx.max_fee_per_gas, tx.gas) {
        lines.push((String::from("Max network fee"), format!("{} ETH", format_units(&fee, 18))));
    }
    lines.push((String::from("Nonce"), format!("{}", tx.nonce)));
    Screen { title: String::from(title), lines, warnings }
}
