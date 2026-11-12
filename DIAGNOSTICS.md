# SiliconVault Diagnostics

## Storage boundary

Diagnostics are disposable operational data stored beneath Tauri's per-application log directory, in a dedicated diagnostics subdirectory. On Windows this resolves through Tauri's app_log_dir API.

- app.log: lifecycle and operational events.
- crash.log: Rust panic records.
- startup.json: versioned startup and previous-start metadata.
- Diagnostic temporary data belongs under Tauri's app_cache_dir in diagnostics-tmp.

**The diagnostics subsystem does not open, enumerate, migrate, back up, or delete the Dexie database or user documents.** Dexie remains the only application database. The diagnostics export contains system metadata and bounded log excerpts only.

## Components

- src-tauri/src/logger.rs: bounded append-only logging, rotation, startup report and panic hook.
- src-tauri/src/error_handler.rs: typed backend error codes and consistent logging.
- src-tauri/src/diagnostics.rs: system snapshot and export commands.
- src/logger.js: frontend logging facade.
- src/diagnostics.js: global window error and unhandled-rejection listeners.
- src/features/diagnostics/components/DiagnosticsDashboard.tsx: system health and export UI.

## Retention and privacy

- Each active log rotates at 1 MiB with up to three numbered generations.
- Exported log excerpts are limited to the latest 64 KiB per log.
- Messages are bounded to 2 KiB and control characters are stripped.
- The logger attempts to redact the current user's home directory.
- Never log document contents, note text, imported file data, credentials, tokens, or arbitrary user paths.
- Diagnostic files are not application backups and must never be used to restore workspace data.

## Failure behavior

Logging failures are non-fatal. A logging write failure must not interrupt editing, importing, saving, backup, or restore. Backend commands return explicit errors; frontend listeners report failures without changing workspace state.

## Export

The dashboard invokes the backend export command and writes the JSON report only after the user chooses a destination through the native save dialog. Export is user-initiated.
