#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Manager, WindowBuilder, WindowUrl};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClientConfig {
    pub role: String, // "Standalone", "Server", "Client"
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

fn get_desktop_app_files_dir(handle: &tauri::AppHandle) -> PathBuf {
    let base = handle
        .path_resolver()
        .app_local_data_dir()
        .or_else(|| handle.path_resolver().app_config_dir())
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("DlkamFiles");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn sanitize_desktop_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "file_download".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
fn get_app_version(handle: tauri::AppHandle) -> String {
    handle.package_info().version.to_string()
}

#[tauri::command]
fn delete_local_file(handle: tauri::AppHandle, file_name: String) -> bool {
    let safe_name = sanitize_desktop_filename(&file_name);
    let target = get_desktop_app_files_dir(&handle).join(safe_name);
    if target.exists() {
        return fs::remove_file(&target).is_ok();
    }
    false
}

#[tauri::command]
fn check_local_file_exists(handle: tauri::AppHandle, file_name: String) -> bool {
    let safe_name = sanitize_desktop_filename(&file_name);
    let target = get_desktop_app_files_dir(&handle).join(safe_name);
    if let Ok(meta) = fs::metadata(&target) {
        return meta.is_file() && meta.len() > 0;
    }
    false
}

fn launch_local_file_or_installer(handle: &tauri::AppHandle, target: &PathBuf) {
    let path_str = target.to_string_lossy().to_string();
    let lower = path_str.to_lowercase();

    #[cfg(target_os = "windows")]
    {
        // 1. MSI installer
        if lower.ends_with(".msi") {
            if std::process::Command::new("msiexec")
                .args(["/i", &path_str])
                .spawn()
                .is_ok()
            {
                return;
            }
        }

        // 2. Windows EXE installer
        // Elevation (UAC) is needed by installer executables.
        // Calling powershell Start-Process with -Verb RunAs prompts Windows UAC cleanly on desktop.
        let escaped_path = path_str.replace('\'', "''");
        let ps_cmd = format!(
            "$p = '{}'; if (Test-Path $p) {{ Start-Process -FilePath $p -Verb RunAs }}",
            escaped_path
        );

        if let Ok(mut child) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &ps_cmd,
            ])
            .spawn()
        {
            let _ = child.wait();
            return;
        }

        // 3. Fallback: explorer.exe "<path>"
        // Explorer executes files in standard interactive desktop session with ShellExecuteExW
        if std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .is_ok()
        {
            return;
        }

        // 4. Fallback: cmd.exe /C start "" "<path>" (without CREATE_NO_WINDOW so elevation/dialogs are not suppressed)
        if std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .is_ok()
        {
            return;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if std::process::Command::new("open").arg(&path_str).spawn().is_ok() {
            return;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if std::process::Command::new("xdg-open").arg(&path_str).spawn().is_ok() {
            return;
        }
    }

    let _ = tauri::api::shell::open(&handle.shell_scope(), path_str, None);
}

#[tauri::command]
fn open_local_file(handle: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let safe_name = sanitize_desktop_filename(&file_name);
    let target = get_desktop_app_files_dir(&handle).join(safe_name);
    if !target.exists() {
        return Err("FILE_NOT_FOUND".to_string());
    }
    let path_str = target.to_string_lossy().to_string();
    launch_local_file_or_installer(&handle, &target);
    Ok(path_str)
}

#[tauri::command]
fn open_local_file_dir(handle: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let safe_name = sanitize_desktop_filename(&file_name);
    let target = get_desktop_app_files_dir(&handle).join(safe_name);
    if !target.exists() {
        return Err("FILE_NOT_FOUND".to_string());
    }
    let path_str = target.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .args(["/select,", &path_str])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["-R", &path_str])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = target.parent() {
            let _ = std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn();
        }
    }

    Ok(path_str)
}

#[tauri::command]
fn save_and_open_local_file(
    handle: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
    open_after: Option<bool>,
) -> Result<String, String> {
    let safe_name = sanitize_desktop_filename(&file_name);
    let dir = get_desktop_app_files_dir(&handle);
    let target = dir.join(&safe_name);
    let mut file = File::create(&target).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.sync_all().ok();
    drop(file);
    let path_str = target.to_string_lossy().to_string();
    if open_after.unwrap_or(true) {
        launch_local_file_or_installer(&handle, &target);
    }
    Ok(path_str)
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
    #[cfg(target_os = "windows")]
    {
        // 1. Explicitly assign AppUserModelID so Windows Taskbar, Shell and Task Manager recognize the application identity
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
        }
        use std::os::windows::ffi::OsStrExt;
        let app_id_wide: Vec<u16> = std::ffi::OsStr::new("ir.dlkam.desktop.app")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let _ = SetCurrentProcessExplicitAppUserModelID(app_id_wide.as_ptr());
        }

        // 2. Configure Edge WebView2 browser switches to drastically reduce RAM & CPU usage:
        // - Limit renderers to 1 process
        // - Limit V8 JavaScript heap to 256MB with aggressive optimize_for_size GC
        // - Disable non-essential background Chromium modules (Translate, Autofill, OptimizationHints)
        // - Disable shader disk cache to keep GPU process lightweight
        // - Enable Windows 11 EcoQoS (Efficiency Mode) for background helper processes
        let browser_args = "--app-name=Dlkam \
                            --renderer-process-limit=1 \
                            --js-flags=\"--max-old-space-size=256 --optimize_for_size\" \
                            --disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,AutofillServerCommunication,CertificateTransparencyComponentUpdater \
                            --disable-background-networking \
                            --disable-component-update \
                            --disable-domain-reliability \
                            --disable-breakpad \
                            --disable-gpu-shader-disk-cache \
                            --enable-features=UseEcoQoSForBackgroundProcess";

        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", browser_args);
    }

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.app_handle();
            let config = get_or_create_config(&handle);

            println!("Initializing Sayan Desktop application in mode: {}", config.role);

            // If Server mode is configured, start the Axum embedded server in background
            if config.role == "Server" {
                let port = config.port;
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = server::start_embedded_server(port, None).await {
                        eprintln!("Failed to start embedded server: {}", e);
                    }
                });
            }

            // Window title using pure ASCII escape for "دلکام" to avoid any encoding/quote bugs on Windows
            let window_title = "\u{062F}\u{0644}\u{06A9}\u{0627}\u{0645}";
            let icon_rgba = include_bytes!("../icons/icon-64x64.rgba");

            let win = match app.get_window("main") {
                Some(w) => w,
                None => {
                    let window_url = WindowUrl::App("index.html".into());
                    WindowBuilder::new(app, "main", window_url)
                        .title(window_title)
                        .inner_size(1366.0, 840.0)
                        .min_inner_size(960.0, 640.0)
                        .resizable(true)
                        .fullscreen(false)
                        .decorations(true)
                        .center()
                        .icon(tauri::Icon::Rgba {
                            rgba: icon_rgba.to_vec(),
                            width: 64,
                            height: 64,
                        })?
                        .build()
                        .expect("failed to spawn main window")
                }
            };

            let _ = win.set_title(window_title);
            let _ = win.set_icon(tauri::Icon::Rgba {
                rgba: icon_rgba.to_vec(),
                width: 64,
                height: 64,
            });

            let win_for_close = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    let _ = win_for_close.eval(
                        "try { localStorage.removeItem('app_current_user'); sessionStorage.removeItem('dlkam_desktop_session_active'); } catch(e) {}",
                    );
                }
                if let tauri::WindowEvent::Destroyed = event {
                    std::process::exit(0);
                }
            });
            let _ = win.maximize();
            let _ = win.show();
            let _ = win.set_focus();
            let win_clone = win.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                let _ = win_clone.maximize();
                let _ = win_clone.set_title(window_title);
                let _ = win_clone.set_icon(tauri::Icon::Rgba {
                    rgba: icon_rgba.to_vec(),
                    width: 64,
                    height: 64,
                });
                tokio::time::sleep(std::time::Duration::from_millis(350)).await;
                let _ = win_clone.maximize();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_client_config,
            save_client_config,
            check_desktop_update,
            start_server_cmd,
            get_app_version,
            delete_local_file,
            check_local_file_exists,
            open_local_file,
            open_local_file_dir,
            save_and_open_local_file
        ])
        .run(tauri::generate_context!())
        .expect("error_running_tauri");
}
