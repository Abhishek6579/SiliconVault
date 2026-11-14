use crate::{activity_log::ActivityLog, error_handler::AppError, logger::Logger, system_monitor::{SystemMonitor, SystemStats}};
use serde::Serialize;
use std::{fs, sync::Mutex, time::Instant};
use tauri::{AppHandle, Manager, State};
pub struct DiagnosticsState { started: Instant }
impl DiagnosticsState { pub fn new() -> Self { Self { started: Instant::now() } } }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSnapshot {
    pub schema_version: u8, pub app_version: &'static str, pub platform: &'static str, pub architecture: &'static str,
    pub uptime_seconds: u64, pub collected_at: String, pub system: SystemStats, pub logs: LogInventory, pub previous_session_clean: Option<bool>, pub recovery_note: String, pub data_isolation: &'static str,
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
    let sessions = app.try_state::<ActivityLog>().map(|activity| serde_json::json!({"directory":"app_log_dir/sessions","recent":activity.recent(3, 16 * 1024)}));
    let payload = serde_json::json!({ "diagnostics": snapshot, "logs": { "app": app_log, "crashes": crash_log }, "sessionActivity": sessions,
        "privacy": "Export excludes Dexie data, knowledge-base records, document contents, and user-selected files." });
    serde_json::to_string_pretty(&payload).map_err(|e| AppError::new("DIAGNOSTICS_SERIALIZATION_FAILED", e.to_string(), true).into_command_error())
}
#[tauri::command]
pub fn log_frontend_event(logger: State<'_, Logger>, level: String, event: String, message: String) -> Result<(), String> {
    if event.len() > 128 || message.len() > 2048 { return Err(AppError::new("INVALID_DIAGNOSTIC_EVENT", "Diagnostic event exceeds the allowed size.", false).into_command_error()); }
    logger.log_frontend(&level, &event, &message); Ok(())
}
fn collect(app: &AppHandle, logger: &Logger, state: &DiagnosticsState, system: SystemStats) -> DiagnosticsSnapshot {
    if let Ok(cache) = app.path().app_cache_dir() { let _ = fs::create_dir_all(cache.join("diagnostics-tmp")); }
    let startup = fs::read_to_string(logger.directory().join("startup.json")).ok()
        .and_then(|contents| serde_json::from_str::<serde_json::Value>(&contents).ok());
    let previous_session_clean = startup.as_ref().and_then(|value| value.get("previousSessionClean").and_then(|item| item.as_bool()));
    let recovery_note = startup.as_ref().and_then(|value| value.get("recoveryNote").and_then(|item| item.as_str()))
        .unwrap_or("Startup recovery information is unavailable.").to_string();
    DiagnosticsSnapshot {
        schema_version: 1, app_version: env!("CARGO_PKG_VERSION"), platform: std::env::consts::OS, architecture: std::env::consts::ARCH,
        uptime_seconds: state.started.elapsed().as_secs(), collected_at: crate::logger::timestamp(), system,
        logs: LogInventory { app_log_bytes: logger.log_size("app.log"), crash_log_bytes: logger.log_size("crash.log"),
            startup_report_bytes: logger.log_size("startup.json"), diagnostics_directory: "app_log_dir/diagnostics".to_string() },
        previous_session_clean, recovery_note,
        data_isolation: "Diagnostics use Tauri app log/cache directories; Dexie and user documents are not accessed.",
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostics_snapshot_serializes_version_and_recovery_metadata() {
        let snapshot = DiagnosticsSnapshot {
            schema_version: 1, app_version: "test", platform: "test", architecture: "test",
            uptime_seconds: 1, collected_at: "0".into(),
            system: SystemStats { cpu: None, ram: None, gpu: None },
            logs: LogInventory { app_log_bytes: 0, crash_log_bytes: 0, startup_report_bytes: 0, diagnostics_directory: "app_log_dir/diagnostics".into() },
            previous_session_clean: Some(false), recovery_note: "Previous session did not shut down cleanly.".into(),
            data_isolation: "Dexie is not accessed.",
        };
        let json = serde_json::to_value(snapshot).unwrap();
        assert_eq!(json["schemaVersion"], 1);
        assert_eq!(json["previousSessionClean"], false);
        assert!(json["recoveryNote"].as_str().unwrap().contains("Previous session"));
    }
}
