#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod diagnostics;
mod error_handler;
mod logger;
mod system_monitor;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
};
use system_monitor::{SystemMonitor, SystemStats};
use tauri::Manager;

static OFFICE_CONVERSION_ID: AtomicU64 = AtomicU64::new(0);

fn find_libreoffice() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("SILICONVAULT_SOFFICE_PATH") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    #[cfg(target_os = "windows")]
    {
        for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
            if let Some(root) = std::env::var_os(variable) {
                let candidate = PathBuf::from(root).join("LibreOffice").join("program").join("soffice.exe");
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for candidate in ["/usr/bin/soffice", "/usr/local/bin/soffice", "/opt/homebrew/bin/soffice"] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    let executable_name = if cfg!(target_os = "windows") { "soffice.exe" } else { "soffice" };
    let path_variable = std::env::var_os("PATH")?;
    std::env::split_paths(&path_variable)
        .map(|directory| directory.join(executable_name))
        .find(|candidate| candidate.is_file())
}

fn path_to_file_url(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let encoded: String = normalized.bytes().map(|byte| {
        if byte.is_ascii_alphanumeric() || b"/-_.~:".contains(&byte) {
            (byte as char).to_string()
        } else {
            format!("%{byte:02X}")
        }
    }).collect();
    if cfg!(target_os = "windows") {
        format!("file:///{encoded}")
    } else {
        format!("file://{encoded}")
    }
}

fn convert_office_document(bytes: Vec<u8>, extension: String) -> Result<Vec<u8>, String> {
    let extension = extension.to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "doc" | "docx" | "docm" | "dot" | "dotx" | "dotm" | "rtf" | "odt" | "fodt" |
        "xls" | "xlsx" | "xlsm" | "xlsb" | "ods" | "fods" |
        "ppt" | "pptx" | "pptm" | "pot" | "potx" | "potm" | "pps" | "ppsx" | "ppsm" |
        "odp" | "fodp"
    ) {
        return Err("This Office file format is not supported by the PDF conversion pipeline.".into());
    }
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 {
        return Err("The Office document is empty or exceeds the 100 MB conversion limit.".into());
    }

    let executable = find_libreoffice().ok_or_else(|| "LibreOffice was not found. Install LibreOffice or configure SILICONVAULT_SOFFICE_PATH to its soffice executable.".to_string())?;
    let id = OFFICE_CONVERSION_ID.fetch_add(1, Ordering::Relaxed);
    let directory = std::env::temp_dir().join(format!("silicon-vault-office-{}-{}", std::process::id(), id));
    let output_directory = directory.join("output");
    fs::create_dir_all(&output_directory).map_err(|error| format!("Could not create a temporary conversion directory: {error}"))?;

    let result = (|| {
        let input = directory.join(format!("source.{extension}"));
        fs::write(&input, bytes).map_err(|error| format!("Could not stage the Office document: {error}"))?;
        let profile = directory.join("lo-profile");
        fs::create_dir_all(&profile).map_err(|error| format!("Could not create a LibreOffice profile: {error}"))?;
        let profile_url = path_to_file_url(&profile);
        let output = Command::new(&executable)
            .arg("--headless")
            .arg("--nologo")
            .arg("--nodefault")
            .arg("--nolockcheck")
            .arg(format!("-env:UserInstallation={profile_url}"))
            .arg("--convert-to")
            .arg("pdf")
            .arg("--outdir")
            .arg(&output_directory)
            .arg(&input)
            .output()
            .map_err(|error| format!("Could not start LibreOffice: {error}"))?;

        let pdf_path = output_directory.join("source.pdf");
        if !output.status.success() || !pdf_path.is_file() {
            let details = String::from_utf8_lossy(&output.stderr);
            let details = details.trim();
            return Err(if details.is_empty() {
                "LibreOffice could not convert this Office document to PDF.".to_string()
            } else {
                format!("LibreOffice conversion failed: {details}")
            });
        }

        let metadata = fs::metadata(&pdf_path).map_err(|error| format!("Could not inspect the converted PDF: {error}"))?;
        if metadata.len() == 0 || metadata.len() > 100 * 1024 * 1024 {
            return Err("The converted PDF is empty or exceeds the 100 MB preview limit.".into());
        }
        fs::read(&pdf_path).map_err(|error| format!("Could not read the converted PDF: {error}"))
    })();

    let _ = fs::remove_dir_all(&directory);
    result
}

#[tauri::command]
async fn convert_office_to_pdf(bytes: Vec<u8>, extension: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || convert_office_document(bytes, extension))
        .await
        .map_err(|error| format!("Office conversion task failed: {error}"))?
}
#[tauri::command]
fn get_system_stats(monitor: tauri::State<'_, Mutex<SystemMonitor>>) -> SystemStats {
    monitor.lock().unwrap_or_else(|p| p.into_inner()).sample()
}
fn main() {
    let mut app = tauri::Builder::default()
        .manage(Mutex::new(SystemMonitor::new()))
        .manage(diagnostics::DiagnosticsState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let directory = app.path().app_log_dir()?.join("diagnostics");
            let logger = logger::Logger::initialize(directory).map_err(std::io::Error::other)?;
            logger.install_panic_hook();
            logger.info("application.ready", "SiliconVault backend initialized");
            let _ = logger::set_global(logger.clone());
            app.manage(logger);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_system_stats, diagnostics::get_diagnostics, diagnostics::export_diagnostics, diagnostics::log_frontend_event, convert_office_to_pdf])
        .build(tauri::generate_context!())
        .expect("failed to build SiliconVault");
    app.run(|_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(logger) = logger::global() {
                logger.info("application.shutdown", "SiliconVault exited cleanly");
                logger.mark_clean_shutdown();
            }
        }
    });
}
