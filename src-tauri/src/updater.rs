use serde::Serialize;
use std::{fs, sync::{Arc, atomic::{AtomicU64, Ordering}}};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const PROGRESS_EVENT: &str = "siliconvault-update-progress";
const RELEASE_NOTES_EVENT: &str = "siliconvault-release-notes";
const RELEASE_NOTES_FILE: &str = "pending-release-notes.json";

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    content_length: Option<u64>,
    finished: bool,
}

fn save_pending_release_notes(app: &AppHandle, info: &UpdateInfo) -> Result<(), String> {
    let directory = app.path().app_data_dir()
        .map_err(|error| format!("Could not locate application data directory: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create application data directory: {error}"))?;

    let destination = directory.join(RELEASE_NOTES_FILE);
    let temporary = directory.join(format!("{RELEASE_NOTES_FILE}.tmp"));
    let contents = serde_json::to_vec(info)
        .map_err(|error| format!("Could not encode release notes: {error}"))?;
    fs::write(&temporary, contents)
        .map_err(|error| format!("Could not save pending release notes: {error}"))?;

    // Windows rename does not replace an existing destination, so remove the stale
    // one first. A pending note is only ever written after a successful installation.
    if destination.exists() {
        fs::remove_file(&destination)
            .map_err(|error| format!("Could not replace pending release notes: {error}"))?;
    }
    fs::rename(&temporary, &destination)
        .map_err(|error| format!("Could not finalize pending release notes: {error}"))
}

fn emit_pending_release_notes(app: &AppHandle) {
    let Ok(directory) = app.path().app_data_dir() else { return; };
    let path = directory.join(RELEASE_NOTES_FILE);
    let Ok(contents) = fs::read(&path) else { return; };
    let Ok(info) = serde_json::from_slice::<UpdateInfo>(&contents) else { return; };

    // Consume the file so release notes are shown once, not on every update check.
    if fs::remove_file(&path).is_ok() {
        let _ = app.emit(RELEASE_NOTES_EVENT, info);
    }
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    emit_pending_release_notes(&app);

    let updater = app.updater().map_err(|error| format!("Could not initialize updater: {error}"))?;
    let update = updater.check().await.map_err(|error| format!("Update check failed: {error}"))?;
    Ok(update.map(|update| UpdateInfo {
        version: update.version,
        notes: update.body,
    }))
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|error| format!("Could not initialize updater: {error}"))?;
    let update = updater.check().await.map_err(|error| format!("Update check failed: {error}"))?
        .ok_or_else(|| "No update is currently available.".to_string())?;

    // Preserve the updater manifest's release notes before consuming the Update.
    let installed_release = UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone(),
    };

    let downloaded = Arc::new(AtomicU64::new(0));
    let progress_app = app.clone();
    let finished_app = app.clone();
    let progress_bytes = Arc::clone(&downloaded);
    update.download_and_install(
        move |chunk_length, content_length| {
            // `chunk_length` is platform-sized (`usize`), while progress is tracked as `u64`.
            // Rust targets supported by Tauri have pointer widths no larger than 64 bits.
            let chunk_length = chunk_length as u64;
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

    // Installation succeeded. Persist notes across the process restart; never block
    // the restart if the optional notes file cannot be written.
    let _ = save_pending_release_notes(&app, &installed_release);
    app.restart();
}
