//! InWIF desktop companion.
//!
//! Hosts the InWIF wallet UI (static export of apps/web) and adds one native
//! capability browsers lack everywhere: direct USB-serial access to InWIF
//! hardware. The backend only moves IWDP frames between the UI and the device;
//! it never sees, stores or derives keys, and it never signs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use inwif_firmware_core::protocol;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::Duration;

/// Placeholder development-board USB IDs (Raspberry Pi RP2040 CDC). Replaced once InWIF has its own VID/PID.
const DEV_BOARD_IDS: &[(u16, u16)] = &[(0x2e8a, 0x000a)];
const MAX_FRAME: usize = 6 + u16::MAX as usize;

#[derive(Default)]
struct Devices(Mutex<HashMap<String, Box<dyn serialport::SerialPort>>>);

#[derive(Serialize)]
struct PortInfo {
    name: String,
    vid: Option<u16>,
    pid: Option<u16>,
    product: Option<String>,
    likely_inwif: bool,
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        .filter_map(|p| match p.port_type {
            serialport::SerialPortType::UsbPort(u) => Some(PortInfo {
                likely_inwif: DEV_BOARD_IDS.contains(&(u.vid, u.pid)) || u.product.as_deref().is_some_and(|s| s.contains("InWIF")),
                name: p.port_name,
                vid: Some(u.vid),
                pid: Some(u.pid),
                product: u.product,
            }),
            _ => None,
        })
        .collect())
}

#[tauri::command]
fn device_open(port: String, state: tauri::State<Devices>) -> Result<(), String> {
    let handle = serialport::new(&port, 115_200).timeout(Duration::from_secs(300)).open().map_err(|e| e.to_string())?;
    state.0.lock().map_err(|_| "lock poisoned")?.insert(port, handle);
    Ok(())
}

#[tauri::command]
fn device_close(port: String, state: tauri::State<Devices>) -> Result<(), String> {
    state.0.lock().map_err(|_| "lock poisoned")?.remove(&port);
    Ok(())
}

/// Send one IWDP request frame and return the device's response frame.
/// The 5-minute read timeout leaves the user time to read the device screen.
#[tauri::command]
fn device_exchange(port: String, frame: Vec<u8>, state: tauri::State<Devices>) -> Result<Vec<u8>, String> {
    protocol::decode(&frame).map_err(|e| format!("refusing malformed IWDP frame: {e:?}"))?;
    let mut devices = state.0.lock().map_err(|_| "lock poisoned")?;
    let dev = devices.get_mut(&port).ok_or("device not open")?;
    dev.write_all(&frame).map_err(|e| e.to_string())?;
    let mut header = [0u8; 6];
    dev.read_exact(&mut header).map_err(|e| e.to_string())?;
    let len = u16::from_be_bytes([header[4], header[5]]) as usize;
    let mut out = Vec::with_capacity((6 + len).min(MAX_FRAME));
    out.extend_from_slice(&header);
    out.resize(6 + len, 0);
    dev.read_exact(&mut out[6..]).map_err(|e| e.to_string())?;
    protocol::decode(&out).map_err(|e| format!("device sent a malformed frame: {e:?}"))?;
    Ok(out)
}

fn main() {
    tauri::Builder::default()
        .manage(Devices::default())
        .invoke_handler(tauri::generate_handler![list_serial_ports, device_open, device_close, device_exchange])
        .run(tauri::generate_context!())
        .expect("error while running InWIF desktop");
}
