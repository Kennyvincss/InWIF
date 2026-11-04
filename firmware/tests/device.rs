//! Cross-implementation tests: byte-for-byte compatibility with the TypeScript
//! companion/simulator (`packages/core`), which produced the vectors below.
use inwif_firmware_core::device::{Device, Ui};
use inwif_firmware_core::display::{format_units, render, Screen};
use inwif_firmware_core::keys::{address, derive, seed_from_mnemonic};
use inwif_firmware_core::protocol::{decode, encode, Status, HARDENED};
use inwif_firmware_core::rlp::decode_exact;
use inwif_firmware_core::tx::{decode_action, parse_eip1559, Action};

const ANVIL: &str = "test test test test test test test test test test test junk";

struct Auto {
    approve: bool,
    shown: Vec<String>,
}
impl Ui for Auto {
    fn confirm(&mut self, s: &Screen) -> bool {
        self.shown.push(format!("{} | {}", s.title, s.lines.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>().join("; ")));
        self.approve
    }
}

fn dev(approve: bool) -> Device<Auto> {
    let mut d = Device::new_dev(Auto { approve, shown: vec![] }, "IWDEV-0001", [7u8; 32]);
    d.restore(ANVIL, "123456").unwrap();
    d
}

const SIGN_WIF_REQ: &str = "495701040085058000002c8000003c80000000000000000000000002f86d82123707830f4240847735940082ea60945173b8ea6923c2d40267890d45c46a348095477380b844a9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000054b40b1f852bda00000c0";
const SIGN_WIF_RES: &str = "4957010000410002e614b38b09a4532f8cdd2827191b79741038639cd44af48fea74f41ec9bb4d5de6083080479da8ac431e2e7436d6ad55172763b0f70e2e695cecb53adb2f6b";
const SIGN_ETH_REQ: &str = "495701040046058000002c8000003c80000000000000000000000102ef82123780830f4240843b9aca008252089470997970c51812dc3a010c7d01b50e0d17dc79c8872386f26fc1000080c0";
const SIGN_ETH_RES: &str = "4957010000410072ce6dc6275ddc0b104a15136e5b9c72457313081451e5709867324a56dc9ad70f67add28bafa659523a8d4b9f6ba0b0e84da79c018f7a0450848d89ac39b0e0";
const ADDR_REQ: &str = "495701030016058000002c8000003c80000000000000000000000000";

#[test]
fn derives_standard_ethereum_addresses() {
    let seed = seed_from_mnemonic(ANVIL, "");
    let path = [44 | HARDENED, 60 | HARDENED, HARDENED, 0, 0];
    let k = derive(&seed, &path).unwrap();
    assert_eq!(hex::encode(address(k.verifying_key())), "f39fd6e51aad88f6f4ce6ab8827279cfffb92266");
}

#[test]
fn get_address_matches_companion() {
    let mut d = dev(true);
    let res = d.handle(&hex::decode(ADDR_REQ).unwrap());
    let f = decode(&res).unwrap();
    assert_eq!(f.code, Status::Ok as u8);
    assert_eq!(hex::encode(f.payload), "f39fd6e51aad88f6f4ce6ab8827279cfffb92266");
}

#[test]
fn signs_wif_transfer_byte_identical_to_typescript() {
    let mut d = dev(true);
    let res = d.handle(&hex::decode(SIGN_WIF_REQ).unwrap());
    assert_eq!(hex::encode(&res), SIGN_WIF_RES, "RFC6979 signatures must match the TS implementation exactly");
    let shown = &d.ui.shown[0];
    assert!(shown.starts_with("Send token"), "{shown}");
    assert!(shown.contains("Amount=25000 WIF"), "{shown}");
    assert!(shown.contains("To=0x70997970c51812dc3a010c7d01b50e0d17dc79c8"), "{shown}");
}

#[test]
fn signs_eth_transfer_on_account_1_byte_identical() {
    let mut d = dev(true);
    assert_eq!(hex::encode(d.handle(&hex::decode(SIGN_ETH_REQ).unwrap())), SIGN_ETH_RES);
    assert!(d.ui.shown[0].contains("Amount=0.01 ETH"));
}

#[test]
fn user_rejection_returns_status_and_no_signature() {
    let mut d = dev(false);
    let f_bytes = d.handle(&hex::decode(SIGN_WIF_REQ).unwrap());
    let f = decode(&f_bytes).unwrap();
    assert_eq!(f.code, Status::UserRejected as u8);
    assert!(f.payload.is_empty());
}

#[test]
fn locked_and_uninitialised_devices_refuse() {
    let mut d = Device::new_dev(Auto { approve: true, shown: vec![] }, "IWDEV-0002", [9u8; 32]);
    assert_eq!(decode(&d.handle(&hex::decode(ADDR_REQ).unwrap())).unwrap().code, Status::NotInitialized as u8);
    d.restore(ANVIL, "123456").unwrap();
    d.lock();
    assert_eq!(decode(&d.handle(&hex::decode(ADDR_REQ).unwrap())).unwrap().code, Status::Locked as u8);
    assert!(!d.unlock("000000"));
    assert!(d.unlock("123456"));
}

#[test]
fn wipes_after_ten_wrong_pins() {
    let mut d = dev(true);
    d.lock();
    for _ in 0..10 {
        assert!(!d.unlock("999999"));
    }
    assert!(!d.is_initialized());
}

#[test]
fn enforces_chain_allow_list() {
    let mut d = dev(true);
    d.allowed_chain_ids = vec![46630];
    assert_eq!(decode(&d.handle(&hex::decode(SIGN_WIF_REQ).unwrap())).unwrap().code, Status::ChainNotAllowed as u8);
}

#[test]
fn rejects_non_standard_paths_and_malformed_frames() {
    let mut d = dev(true);
    // m/44'/60'/0'/1/0 (change branch) is refused by policy
    let mut payload = vec![5u8];
    for c in [44 | HARDENED, 60 | HARDENED, HARDENED, 1, 0] {
        payload.extend_from_slice(&c.to_be_bytes());
    }
    payload.push(0);
    let req = encode(0x03, &payload).unwrap();
    assert_eq!(decode(&d.handle(&req)).unwrap().code, Status::BadRequest as u8);
    assert_eq!(decode(&d.handle(&[0x49, 0x57, 1, 1, 0, 9])).unwrap().code, Status::BadRequest as u8);
    assert_eq!(decode(&d.handle(&encode(0x7f, &[]).unwrap())).unwrap().code, Status::Unsupported as u8);
}

#[test]
fn decodes_unlimited_approvals_and_warns() {
    // approve(0x7099…, 2^256-1) on WIF
    let mut data = hex::decode("095ea7b3").unwrap();
    data.extend_from_slice(&[0u8; 12]);
    data.extend_from_slice(&hex::decode("70997970c51812dc3a010c7d01b50e0d17dc79c8").unwrap());
    data.extend_from_slice(&[0xff; 32]);
    let tx = inwif_firmware_core::tx::Eip1559Tx {
        chain_id: 4663,
        nonce: 1,
        max_priority_fee_per_gas: [0; 32],
        max_fee_per_gas: [0; 32],
        gas: 50_000,
        to: Some(hex::decode("5173b8ea6923c2d40267890d45c46a3480954773").unwrap().try_into().unwrap()),
        value: [0; 32],
        data,
    };
    assert!(matches!(decode_action(&tx), Action::TokenApprove { unlimited: true, .. }));
    let s = render(&tx);
    assert!(s.lines.iter().any(|(k, v)| k == "Allowance" && v == "UNLIMITED"));
    assert!(!s.warnings.is_empty());
}

#[test]
fn rlp_and_tx_parser_reject_garbage() {
    assert!(decode_exact(&[0x81, 0x05]).is_err()); // non-canonical single byte
    assert!(decode_exact(&[0xc2, 0x01]).is_err()); // truncated list
    assert!(parse_eip1559(&[0x01, 0xc0]).is_err()); // wrong type
    assert!(parse_eip1559(&[0x02, 0xc1, 0x80]).is_err()); // wrong field count
}

#[test]
fn formats_units() {
    let mut v = [0u8; 32];
    v[24..].copy_from_slice(&1_500_000_000_000_000_000u64.to_be_bytes());
    assert_eq!(format_units(&v, 18), "1.5");
    assert_eq!(format_units(&[0u8; 32], 18), "0");
    let mut one = [0u8; 32];
    one[31] = 1;
    assert_eq!(format_units(&one, 6), "0.000001");
}

#[test]
fn attestation_and_firmware_signatures_verify() {
    use inwif_firmware_core::device::{dev_vendor_key, firmware_digest};
    use inwif_firmware_core::keys::{keccak256, sign_digest};
    let mut d = dev(true);
    // attestation response is r||s||y (65 bytes)
    let res = d.handle(&encode(0x06, &[1u8; 32]).unwrap());
    let f = decode(&res).unwrap();
    assert_eq!(f.code, 0);
    assert_eq!(f.payload.len(), 65);
    // valid dev-signed firmware is accepted
    let ih = keccak256(b"image");
    let (y, r, s) = sign_digest(&dev_vendor_key(), &firmware_digest("0.2.0-dev", &ih)).unwrap();
    let sig = format!("0x{}{}{:02x}", hex::encode(r), hex::encode(s), y);
    let pkg = format!("{{\"version\":\"0.2.0-dev\",\"imageHash\":\"0x{}\",\"signature\":\"{}\"}}", hex::encode(ih), sig);
    assert_eq!(decode(&d.handle(&encode(0x07, pkg.as_bytes()).unwrap())).unwrap().code, 0);
    assert_eq!(d.firmware, "0.2.0-dev");
    // tampered version is rejected
    let forged = pkg.replace("0.2.0-dev", "9.9.9-dev");
    assert_eq!(decode(&d.handle(&encode(0x07, forged.as_bytes()).unwrap())).unwrap().code, Status::BadSignature as u8);
}
