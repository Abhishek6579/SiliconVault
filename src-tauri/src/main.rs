mod diagnostics;
mod error_handler;
mod logger;
mod system_monitor;
use std::sync::Mutex;
use system_monitor::{SystemMonitor, SystemStats};
use tauri::Manager;
#[tauri::command]
fn get_system_stats(monitor: tauri::State<'_, Mutex<SystemMonitor>>) -> SystemStats {
    monitor.lock().unwrap_or_else(|p| p.into_inner()).sample()
}
fn main() {
    tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![get_system_stats, diagnostics::get_diagnostics, diagnostics::export_diagnostics, diagnostics::log_frontend_event])
        .run(tauri::generate_context!())
        .expect("failed to run SiliconVault");
}
