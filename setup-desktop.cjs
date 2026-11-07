// Complete Windows Desktop Fix & Builder
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const mainPath = path.join(rootDir, 'src-tauri', 'src', 'main.rs');

console.log('--- [1/3] Writing clean offline main.rs ---');

const cleanMainRs = `#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{WindowBuilder, WindowUrl};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClientConfig {
    pub role: String,
    pub local_server_url: String,
    pub server_url: String,
    pub port: u16,
    pub update_url: String,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            role: "Standalone".to_string(),
            local_server_url: "http://localhost:8080".to_string(),
            server_url: "http://localhost:8080".to_string(),
            port: 8080,
            update_url: "".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct TauriUpdateManifest {
    version: Option<String>,
    notes: Option<String>,
    pub_date: Option<String>,
    platforms: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub release_notes: String,
    pub error: Option<String>,
}

#[tauri::command]
fn get_client_config(handle: tauri::AppHandle) -> ClientConfig {
    get_or_create_config(&handle)
}

#[tauri::command]
fn save_client_config(handle: tauri::AppHandle, config: ClientConfig) -> Result<(), String> {
    let config_dir = handle
        .path_resolver()
        .app_config_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_file = config_dir.join("config.json");
    let mut file = File::create(config_file).map_err(|e| e.to_string())?;
    let json_data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    file.write_all(json_data.as_bytes())
        .map_err(|e| e.to_string())?;

    if config.role == "Server" {
        let port = config.port;
        tauri::async_runtime::spawn(async move {
            let _ = server::start_embedded_server(port, None).await;
        });
    }

    Ok(())
}

#[tauri::command]
async fn start_server_cmd(port: Option<u16>) -> Result<String, String> {
    let target_port = port.unwrap_or(8080);
    server::start_embedded_server(target_port, None).await?;
    Ok(format!("Embedded server started on 0.0.0.0:{}", target_port))
}

#[tauri::command]
fn check_desktop_update(
    handle: tauri::AppHandle,
    custom_url: Option<String>,
) -> UpdateCheckResult {
    let config = get_or_create_config(&handle);
    let app_version = handle.package_info().version.to_string();

    let target_endpoint = if let Some(u) = custom_url {
        if !u.trim().is_empty() {
            u
        } else {
            config.update_url.clone()
        }
    } else {
        config.update_url.clone()
    };

    let resolved_url = if !target_endpoint.trim().is_empty() {
        target_endpoint
    } else {
        format!("{}/api/desktop/updater.json", config.server_url.trim_end_matches('/'))
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build();

    match client {
        Ok(c) => match c.get(&resolved_url).send() {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(manifest) = response.json::<TauriUpdateManifest>() {
                        let latest_ver = manifest.version.unwrap_or_else(|| app_version.clone());
                        let notes = manifest.notes.unwrap_or_default();

                        let mut dl_url = "".to_string();
                        if let Some(platforms) = manifest.platforms {
                            if let Some(win) = platforms.get("windows-x86_64") {
                                if let Some(u) = win.get("url").and_then(|v| v.as_str()) {
                                    dl_url = u.to_string();
                                }
                            }
                        }

                        let has_update = latest_ver != app_version;
                        UpdateCheckResult {
                            has_update,
                            current_version: app_version,
                            latest_version: latest_ver,
                            download_url: dl_url,
                            release_notes: notes,
                            error: None,
                        }
                    } else {
                        UpdateCheckResult {
                            has_update: false,
                            current_version: app_version,
                            latest_version: "نامشخص".to_string(),
                            download_url: "".to_string(),
                            release_notes: "".to_string(),
                            error: Some("فرمت فایل بروزرسانی نامعتبر است".to_string()),
                        }
                    }
                } else {
                    UpdateCheckResult {
                        has_update: false,
                        current_version: app_version,
                        latest_version: "نامشخص".to_string(),
                        download_url: "".to_string(),
                        release_notes: "".to_string(),
                        error: Some(format!("پاسخ ناموفق سرور: {}", response.status())),
                    }
                }
            }
            Err(e) => UpdateCheckResult {
                has_update: false,
                current_version: app_version,
                latest_version: "نامشخص".to_string(),
                download_url: "".to_string(),
                release_notes: "".to_string(),
                error: Some(format!("عدم برقراری ارتباط با لینک آپدیت: {}", e)),
            },
        },
        Err(e) => UpdateCheckResult {
            has_update: false,
            current_version: app_version,
            latest_version: "نامشخص".to_string(),
            download_url: "".to_string(),
            release_notes: "".to_string(),
            error: Some(e.to_string()),
        },
    }
}

fn get_or_create_config(handle: &tauri::AppHandle) -> ClientConfig {
    let config_dir = handle
        .path_resolver()
        .app_config_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let config_file = config_dir.join("config.json");

    if config_file.exists() {
        if let Ok(content) = fs::read_to_string(&config_file) {
            if let Ok(config) = serde_json::from_str::<ClientConfig>(&content) {
                return config;
            }
        }
    }

    let default_config = ClientConfig::default();
    if let Ok(_) = fs::create_dir_all(&config_dir) {
        if let Ok(mut file) = File::create(config_file) {
            let _ = file.write_all(
                serde_json::to_string_pretty(&default_config)
                    .unwrap()
                    .as_bytes(),
            );
        }
    }
    default_config
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.app_handle();
            let config = get_or_create_config(&handle);

            println!("Initializing Sayan Desktop application in mode: {}", config.role);

            if config.role == "Server" {
                let port = config.port;
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = server::start_embedded_server(port, None).await {
                        eprintln!("Failed to start embedded server: {}", e);
                    }
                });
            }

            // ALWAYS load the local bundled offline application UI
            let window_url = WindowUrl::App("index.html".into());

            let main_window = WindowBuilder::new(app, "main", window_url)
                .title("دلکام")
                .resizable(true)
                .fullscreen(false)
                .maximized(true)
                .decorations(true)
                .center()
                .build();

            match main_window {
                Ok(_) => println!("Main desktop window successfully spawned with local UI."),
                Err(e) => eprintln!("Error spawning desktop window: {:?}", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_client_config,
            save_client_config,
            check_desktop_update,
            start_server_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`;

fs.writeFileSync(mainPath, cleanMainRs, 'utf8');
console.log('✅ src-tauri/src/main.rs successfully written!');

console.log('--- [2/3] Clearing old Windows AppData cache ---');
const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : null);
if (appData) {
  const oldConfigDir = path.join(appData, 'com.lepan.warehouse.app');
  if (fs.existsSync(oldConfigDir)) {
    try {
      fs.rmSync(oldConfigDir, { recursive: true, force: true });
      console.log('✅ Cleared old cached config from:', oldConfigDir);
    } catch (e) {
      console.warn('Could not remove AppData folder:', e.message);
    }
  } else {
    console.log('ℹ️ No old AppData cache found.');
  }
}

console.log('--- [3/3] Ready for instant build: run npx tauri build -- --jobs 1 ---');
