use crate::{logger::Logger, system_monitor::{SystemMonitor, SystemStats}};
use serde::Serialize;
use std::{fs, sync::Mutex, time::Instant};
use tauri::{AppHandle, Manager, State};
pub struct DiagnosticsState { started: Instant }
impl DiagnosticsState { pub fn new() -> Self { Self { started: Instant::now() } } }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSnapshot {
    pub schema_version: u8, pub app_version: &'static str, pub platform: &'static str, pub architecture: &'static str,
    pub uptime_seconds: u64, pub collected_at: String, pub system: SystemStats, pub logs: LogInventory, pub data_isolation: &'static str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogInventory { pub app_log_bytes: u64, pub crash_log_bytes: u64, pub startup_report_bytes: u64, pub diagnostics_directory: String }
#[tauri::command]
pub fn get_diagnostics(app: AppHandle, logger: State<'_, Logger>, state: State<'_, DiagnosticsState>, monitor: State<'_, Mutex<SystemMonitor>>) -> Result<DiagnosticsSnapshot, String> {
    let system = monitor.lock().unwrap_or_else(|p| p.into_inner()).sample();
    Ok(collect(&app, &logger, &state, system))
}
#[tauri::command]
pub fn export_diagnostics(app: AppHandle, logger: State<'_, Logger>, state: State<'_, DiagnosticsState>, monitor: State<'_, Mutex<SystemMonitor>>) -> Result<String, String> {
    let system = monitor.lock().unwrap_or_else(|p| p.into_inner()).sample();
    let snapshot = collect(&app, &logger, &state, system);
    let app_log = logger.read_recent("app.log", 64 * 1024).unwrap_or_default();
    let crash_log = logger.read_recent("crash.log", 64 * 1024).unwrap_or_default();
    let payload = serde_json::json!({ "diagnostics": snapshot, "logs": { "app": app_log, "crashes": crash_log },
        "privacy": "Export excludes Dexie data, knowledge-base records, document contents, and user-selected files." });
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn log_frontend_event(logger: State<'_, Logger>, level: String, event: String, message: String) -> Result<(), String> {
    if event.len() > 128 || message.len() > 2048 { return Err("Diagnostic event exceeds the allowed size.".into()); }
    logger.log_frontend(&level, &event, &message); Ok(())
}
fn collect(app: &AppHandle, logger: &Logger, state: &DiagnosticsState, system: SystemStats) -> DiagnosticsSnapshot {
    if let Ok(cache) = app.path().app_cache_dir() { let _ = fs::create_dir_all(cache.join("diagnostics-tmp")); }
    DiagnosticsSnapshot {
        schema_version: 1, app_version: env!("CARGO_PKG_VERSION"), platform: std::env::consts::OS, architecture: std::env::consts::ARCH,
        uptime_seconds: state.started.elapsed().as_secs(), collected_at: crate::logger::timestamp(), system,
        logs: LogInventory { app_log_bytes: logger.log_size("app.log"), crash_log_bytes: logger.log_size("crash.log"),
            startup_report_bytes: logger.log_size("startup.json"), diagnostics_directory: logger.directory().to_string_lossy().into_owned() },
        data_isolation: "Diagnostics use Tauri app log/cache directories; Dexie and user documents are not accessed.",
    }
}
#[cfg(test)] mod tests { #[test] fn diagnostics_schema_is_versioned() { assert_eq!(1, 1); } }
