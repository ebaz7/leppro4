// Automated fixer for Tauri build on Windows
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const confPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

console.log('=== FIXING TAURI CONFIGURATION & MEMORY ISSUES ===');

// 1. Write clean Cargo.toml with single codegen-unit (prevents Out of Memory / STATUS_STACK_BUFFER_OVERRUN)
const cleanCargo = `[package]
name = "sayan-warehouse"
version = "1.0.0"
description = "Dlkam warehouse system desktop application with embedded server and client-server dual role support"
authors = ["Dlkam Core Team"]
license = "MIT"
repository = ""
edition = "2021"
rust-version = "1.65"

[build-dependencies]
tauri-build = { version = "1.4", features = [] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "1.4", default-features = false, features = ["wry", "custom-protocol", "shell-open", "http-request"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
reqwest = { version = "0.11", default-features = false, features = ["json", "blocking", "native-tls"] }

# Embedded Server & Dual-Role Networking Dependencies
axum = { version = "0.6", default-features = false, features = ["http1", "json", "tokio"] }
tower = { version = "0.4", default-features = false, features = ["util"] }
tower-http = { version = "0.4", default-features = false, features = ["cors", "fs"] }

[profile.release]
panic = "abort"
opt-level = 1
codegen-units = 1
lto = false
incremental = false
strip = true
`;

fs.writeFileSync(cargoPath, cleanCargo, 'utf8');
console.log('✅ src-tauri/Cargo.toml: Replaced with lightweight, memory-efficient configuration.');

// 2. Ensure .cargo/config.toml enforces single-job compilation
const cargoDir = path.join(rootDir, 'src-tauri', '.cargo');
if (!fs.existsSync(cargoDir)) fs.mkdirSync(cargoDir, { recursive: true });
const cargoConfigPath = path.join(cargoDir, 'config.toml');
const cargoConfigContent = `[build]
jobs = 1

[env]
CARGO_BUILD_JOBS = "1"

[target.x86_64-pc-windows-msvc]
rustflags = ["-C", "link-args=/STACK:16777216"]
`;
fs.writeFileSync(cargoConfigPath, cargoConfigContent, 'utf8');
console.log('✅ src-tauri/.cargo/config.toml: Configured single-threaded compilation.');

// 3. Fix tauri.conf.json: Ensure updater block is completely removed and valid
if (fs.existsSync(confPath)) {
  try {
    const raw = fs.readFileSync(confPath, 'utf8');
    const conf = JSON.parse(raw);
    if (conf.tauri && conf.tauri.updater) delete conf.tauri.updater;
    if (conf.updater) delete conf.updater;
    fs.writeFileSync(confPath, JSON.stringify(conf, null, 2), 'utf8');
    console.log('✅ src-tauri/tauri.conf.json: Verified and cleaned.');
  } catch (err) {
    console.error('❌ Error processing tauri.conf.json:', err.message);
  }
}

console.log('=== DONE! You can now run the build command without memory crashes. ===');
