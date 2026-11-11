mod system_monitor;

use std::sync::Mutex;
use system_monitor::{SystemMonitor, SystemStats};

#[tauri::command]
fn get_system_stats(monitor: tauri::State<'_, Mutex<SystemMonitor>>) -> SystemStats {
    monitor.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).sample()
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(SystemMonitor::new()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_system_stats])
        .run(tauri::generate_context!())
        .expect("failed to run SiliconVault");
}
