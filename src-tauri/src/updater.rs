use serde::Serialize;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

const PROGRESS_EVENT: &str = "siliconvault-update-progress";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    content_length: Option<u64>,
    finished: bool,
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|error| format!("Could not initialize updater: {error}"))?;
    let update = updater.check().await.map_err(|error| format!("Update check failed: {error}"))?;
    Ok(update.map(|update| UpdateInfo {
        version: update.version,
        notes: update.body,
        date: update.date.map(|date| date.to_rfc3339()),
    }))
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|error| format!("Could not initialize updater: {error}"))?;
    let update = updater.check().await.map_err(|error| format!("Update check failed: {error}"))?
        .ok_or_else(|| "No update is currently available.".to_string())?;

    let downloaded = Arc::new(AtomicU64::new(0));
    let progress_app = app.clone();
    let finished_app = app.clone();
    let progress_bytes = Arc::clone(&downloaded);
    update.download_and_install(
        move |chunk_length, content_length| {
            let total = progress_bytes.fetch_add(chunk_length, Ordering::Relaxed).saturating_add(chunk_length);
            let _ = progress_app.emit(PROGRESS_EVENT, UpdateProgress {
                downloaded: total,
                content_length,
                finished: false,
            });
        },
        move || {
            let _ = finished_app.emit(PROGRESS_EVENT, UpdateProgress {
                downloaded: downloaded.load(Ordering::Relaxed),
                content_length: None,
                finished: true,
            });
        },
    ).await.map_err(|error| format!("Update installation failed: {error}"))?;

    app.restart();
    Ok(())
}
