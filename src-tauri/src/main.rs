#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod diagnostics;
mod activity_log;
mod error_handler;
mod logger;
mod system_monitor;
mod updater;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
};
use system_monitor::{SystemMonitor, SystemStats};
use tauri::Manager;

static OFFICE_CONVERSION_ID: AtomicU64 = AtomicU64::new(0);


fn find_document_builder() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("SILICONVAULT_DOCBUILDER_PATH") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let executable_name = if cfg!(target_os = "windows") { "docbuilder.exe" } else { "documentbuilder" };
    let path_variable = std::env::var_os("PATH")?;
    std::env::split_paths(&path_variable)
        .map(|directory| directory.join(executable_name))
        .find(|candidate| candidate.is_file())
}

fn convert_with_document_builder(
    executable: &Path,
    input: &Path,
    output: &Path,
    directory: &Path,
) -> Result<Vec<u8>, String> {
    let script_path = directory.join("convert.js");
    let input_path = serde_json::to_string(&input.to_string_lossy().to_string())
        .map_err(|error| format!("Could not encode Document Builder input path: {error}"))?;
    let output_path = serde_json::to_string(&output.to_string_lossy().to_string())
        .map_err(|error| format!("Could not encode Document Builder output path: {error}"))?;
    let script = format!(
        "if (!builderJS.OpenFile({input_path})) throw new Error('Could not open the Office input');\ntry {{\n    if (!builderJS.SaveFile(\"pdf\", {output_path})) throw new Error('Could not save the PDF output');\n}} finally {{\n    builderJS.CloseFile();\n}}\n"
    );
    fs::write(&script_path, script)
        .map_err(|error| format!("Could not create the Document Builder script: {error}"))?;

    let result = Command::new(executable)
        .arg(&script_path)
        .current_dir(directory)
        .output()
        .map_err(|error| format!("Could not start ONLYOFFICE Document Builder: {error}"))?;

    if !result.status.success() || !output.is_file() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        let details = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
        return Err(if details.is_empty() {
            "ONLYOFFICE Document Builder could not convert this document.".to_string()
        } else {
            format!("ONLYOFFICE Document Builder failed: {details}")
        });
    }

    let metadata = fs::metadata(output)
        .map_err(|error| format!("Could not inspect the Document Builder PDF: {error}"))?;
    if metadata.len() == 0 || metadata.len() > 100 * 1024 * 1024 {
        return Err("The Document Builder PDF is empty or exceeds the 100 MB preview limit.".into());
    }
    fs::read(output).map_err(|error| format!("Could not read the Document Builder PDF: {error}"))
}

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

    let id = OFFICE_CONVERSION_ID.fetch_add(1, Ordering::Relaxed);
    let directory = std::env::temp_dir().join(format!("silicon-vault-office-{}-{}", std::process::id(), id));
    let output_directory = directory.join("output");
    fs::create_dir_all(&output_directory).map_err(|error| format!("Could not create a temporary conversion directory: {error}"))?;

    let result = (|| {
        let input = directory.join(format!("source.{extension}"));
        fs::write(&input, bytes).map_err(|error| format!("Could not stage the Office document: {error}"))?;
        let pdf_path = output_directory.join("source.pdf");

        // Prefer Document Builder when explicitly configured. It is a native conversion
        // engine and avoids adding a Python, Java, or Node.js runtime to SiliconVault.
        if let Some(builder) = find_document_builder() {
            match convert_with_document_builder(&builder, &input, &pdf_path, &directory) {
                Ok(pdf) => return Ok(pdf),
                Err(builder_error) => {
                    if let Some(executable) = find_libreoffice() {
                        let _ = fs::remove_file(&pdf_path);
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
                            .map_err(|error| format!("Document Builder failed ({builder_error}); could not start LibreOffice: {error}"))?;
                        if output.status.success() && pdf_path.is_file() {
                            let metadata = fs::metadata(&pdf_path).map_err(|error| format!("Could not inspect the converted PDF: {error}"))?;
                            if metadata.len() > 0 && metadata.len() <= 100 * 1024 * 1024 {
                                return fs::read(&pdf_path).map_err(|error| format!("Could not read the converted PDF: {error}"));
                            }
                        }
                    }
                    return Err(format!("{builder_error} Configure a licensed ONLYOFFICE Document Builder runtime with SILICONVAULT_DOCBUILDER_PATH, or install LibreOffice."));
                }
            }
        }

        let executable = find_libreoffice().ok_or_else(|| "No Office conversion engine was found. Configure SILICONVAULT_DOCBUILDER_PATH for ONLYOFFICE Document Builder or install LibreOffice.".to_string())?;
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

fn is_desktop_test_mode() -> bool {
    std::env::args_os().any(|arg| arg == "--silicon-vault-desktop-test")
}

fn desktop_test_webview_data_directory() -> Option<PathBuf> {
    const PREFIX: &str = "--silicon-vault-webview-data-dir=";
    std::env::args_os()
        .find_map(|arg| {
            arg.to_string_lossy()
                .strip_prefix(PREFIX)
                .map(PathBuf::from)
        })
        .or_else(|| std::env::var_os("SILICON_VAULT_WEBVIEW_DATA_DIR").map(PathBuf::from))
}

#[tauri::command]
fn get_desktop_test_diagnostics() -> Result<serde_json::Value, String> {
    let directory = desktop_test_webview_data_directory();
    let entries = directory.as_ref().and_then(|path| {
        fs::read_dir(path).ok().map(|items| {
            items.filter_map(Result::ok)
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
        })
    });

    Ok(serde_json::json!({
        "desktopTestMode": is_desktop_test_mode(),
        "pid": std::process::id(),
        "executable": std::env::current_exe().ok().map(|path| path.display().to_string()),
        "arguments": std::env::args().collect::<Vec<_>>(),
        "webviewDataDirectory": directory.as_ref().map(|path| path.display().to_string()),
        "webviewDataDirectoryExists": directory.as_ref().is_some_and(|path| path.is_dir()),
        "webviewDataDirectoryEntries": entries,
        "localAppData": std::env::var_os("LOCALAPPDATA").map(|value| value.to_string_lossy().into_owned())
    }))
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Mutex::new(SystemMonitor::new()))
        .manage(diagnostics::DiagnosticsState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let log_directory = app.path().app_log_dir()?;
            if let Some(activity) = activity_log::ActivityLog::initialize(log_directory.clone()) { app.manage(activity); }
            let directory = log_directory.join("diagnostics");
            let logger = logger::Logger::initialize(directory).map_err(std::io::Error::other)?;
            logger.install_panic_hook();
            logger.info("application.ready", "SiliconVault backend initialized");
            let _ = logger::set_global(logger.clone());
            app.manage(logger.clone());

            let window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "main window configuration is missing",
                    )
                })?;

            let mut window_builder =
                tauri::WebviewWindowBuilder::from_config(app.handle(), window_config)?;

            let data_directory = desktop_test_webview_data_directory();
            if let Some(data_directory) = data_directory {
                fs::create_dir_all(&data_directory)?;
                let data_directory = fs::canonicalize(&data_directory)?;
                logger.info(
                    "webview.profile",
                    &format!("Using WebView2 data directory: {}", data_directory.display()),
                );
                window_builder = window_builder.data_directory(data_directory);
            }

            window_builder.build()?;
            logger.info("webview.window.created", "Main WebView window created");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_system_stats, diagnostics::get_diagnostics, diagnostics::export_diagnostics, diagnostics::log_frontend_event, get_desktop_test_diagnostics, activity_log::activity_log_event, activity_log::activity_log_events, convert_office_to_pdf, updater::check_for_update, updater::install_update])
        .build(tauri::generate_context!())
        .expect("failed to build SiliconVault");
    app.run(|_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(logger) = logger::global() {
                logger.info("application.shutdown", "SiliconVault exited cleanly");
                logger.mark_clean_shutdown();
            }
            if let Some(activity) = _handle.try_state::<activity_log::ActivityLog>() { activity.write_event(activity_log::Event { ts:String::new(),seq:0,session_id:String::new(),action_id:None,kind:"STATE".into(),name:"application.shutdown.clean".into(),component:None,params:serde_json::json!({}),outcome:Some("success".into()),duration_ms:None,error:None }); }
        }
    });
}
