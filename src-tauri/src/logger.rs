use serde::Serialize;
use std::{fs::{self, File, OpenOptions}, io::Write, path::{Path, PathBuf}, sync::{Arc, Mutex, OnceLock}, time::{SystemTime, UNIX_EPOCH}};
const MAX_LOG_BYTES: u64 = 1024 * 1024;
const ROTATED_LOGS: usize = 3;
const MAX_LOG_AGE_SECONDS: u64 = 30 * 24 * 60 * 60;
static GLOBAL_LOGGER: OnceLock<Logger> = OnceLock::new();
#[derive(Clone)]
pub struct Logger { directory: Arc<PathBuf>, write_lock: Arc<Mutex<()>>, session_id: Arc<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupReport { schema_version: u8, started_at: String, previous_startup: Option<String>, previous_session_clean: Option<bool>, clean_shutdown: bool, recovery_note: &'static str, app_version: &'static str, operating_system: &'static str, architecture: &'static str, session_id: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogRecord<'a> { timestamp: String, level: &'a str, event: String, message: String, app_version: &'static str, operating_system: &'static str, architecture: &'static str, session_id: &'a str }
impl Logger {
    pub fn initialize(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|e| format!("Cannot create diagnostics directory: {e}"))?;
        let session_id = format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), std::process::id());
        let logger = Self { directory: Arc::new(directory), write_lock: Arc::new(Mutex::new(())), session_id: Arc::new(session_id) };
        logger.prune_old_logs();
        let previous = fs::read_to_string(logger.path("startup.json")).ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
        let previous_startup = previous.as_ref().and_then(|v| v.get("startedAt").and_then(|x| x.as_str()).map(str::to_owned));
        let previous_session_clean = previous.as_ref().and_then(|v| v.get("cleanShutdown").and_then(|x| x.as_bool()));
        let recovery_note = match previous_session_clean {
            Some(false) => "The previous session did not record a clean shutdown; review crash.log and app.log.",
            Some(true) => "The previous session recorded a clean shutdown.",
            None => "No previous shutdown status is available.",
        };
        let report = StartupReport { schema_version: 1, started_at: timestamp(), previous_startup, previous_session_clean, clean_shutdown: false,
            recovery_note,
            app_version: env!("CARGO_PKG_VERSION"), operating_system: std::env::consts::OS, architecture: std::env::consts::ARCH, session_id: (*logger.session_id).clone() };
        fs::write(logger.path("startup.json"), serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Cannot write startup report: {e}"))?;
        for name in ["app.log", "crash.log"] {
            OpenOptions::new().create(true).append(true).open(logger.path(name))
                .map_err(|e| format!("Cannot initialize {name}: {e}"))?;
        }
        logger.info("application.startup", "Diagnostics logger initialized");
        Ok(logger)
    }
    pub fn install_panic_hook(&self) {
        let logger = self.clone();
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |panic| {
            let location = panic.location().map(|v| format!("{}:{}", v.file(), v.line())).unwrap_or_else(|| "unknown".into());
            let message = panic.payload().downcast_ref::<&str>().copied()
                .or_else(|| panic.payload().downcast_ref::<String>().map(String::as_str)).unwrap_or("non-string panic payload");
            logger.crash("rust.panic", &format!("{message} ({location})"));
            previous(panic);
        }));
    }
    pub fn info(&self, event: &str, message: &str) { self.write("INFO", event, message); }
    pub fn warn(&self, event: &str, message: &str) { self.write("WARN", event, message); }
    pub fn error(&self, event: &str, message: &str) { self.write("ERROR", event, message); }
    pub fn fatal(&self, event: &str, message: &str) { self.write_to("crash.log", "FATAL", event, message); }
    pub fn crash(&self, event: &str, message: &str) { self.fatal(event, message); }
    pub fn log_frontend(&self, level: &str, event: &str, message: &str) {
        let level = match level.to_ascii_lowercase().as_str() { "warn" | "warning" => "WARN", "error" => "ERROR", "fatal" | "critical" => "FATAL", "debug" => "DEBUG", _ => "INFO" };
        self.write(level, event, message);
        if level == "ERROR" || level == "FATAL" { self.write_to("crash.log", "FRONTEND_ERROR", event, message); }
    }
    pub fn mark_clean_shutdown(&self) {
        let path = self.path("startup.json");
        if let Ok(contents) = fs::read_to_string(&path) {
            if let Ok(mut report) = serde_json::from_str::<serde_json::Value>(&contents) {
                report["cleanShutdown"] = serde_json::Value::Bool(true);
                report["shutdownAt"] = serde_json::Value::String(timestamp());
                if let Ok(serialized) = serde_json::to_vec_pretty(&report) { let _ = fs::write(path, serialized); }
            }
        }
    }
    pub fn directory(&self) -> &Path { self.directory.as_path() }
    pub fn log_size(&self, name: &str) -> u64 { fs::metadata(self.path(name)).map(|m| m.len()).unwrap_or(0) }
    pub fn read_recent(&self, name: &str, max_bytes: usize) -> Result<String, String> {
        let contents = fs::read(self.path(name)).map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&contents[contents.len().saturating_sub(max_bytes)..]).into_owned())
    }
    fn write(&self, level: &str, event: &str, message: &str) { self.write_to("app.log", level, event, message); }
    fn write_to(&self, filename: &str, level: &str, event: &str, message: &str) {
        let _guard = self.write_lock.lock().unwrap_or_else(|p| p.into_inner());
        let path = self.path(filename);
        if fs::metadata(&path).map(|m| m.len() >= MAX_LOG_BYTES).unwrap_or(false) { self.rotate(filename); }
        let record = LogRecord { timestamp: timestamp(), level, event: clean(event), message: clean(message),
            app_version: env!("CARGO_PKG_VERSION"), operating_system: std::env::consts::OS,
            architecture: std::env::consts::ARCH, session_id: self.session_id.as_str() };
        let line = serde_json::to_string(&record).unwrap_or_else(|_| "{\"level\":\"ERROR\",\"event\":\"logger.serialization_failed\"}".into()) + "\n";
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) { let _ = file.write_all(line.as_bytes()); let _ = file.flush(); }
    }
    fn rotate(&self, filename: &str) {
        for index in (1..=ROTATED_LOGS).rev() {
            let source = if index == 1 { self.path(filename) } else { self.path(&format!("{filename}.{}", index - 1)) };
            let destination = self.path(&format!("{filename}.{index}"));
            if index == ROTATED_LOGS { let _ = fs::remove_file(&destination); }
            if source.exists() { let _ = fs::rename(source, destination); }
        }
        let _ = File::create(self.path(filename));
    }
    fn prune_old_logs(&self) {
        let cutoff = SystemTime::now().checked_sub(std::time::Duration::from_secs(MAX_LOG_AGE_SECONDS)).unwrap_or(UNIX_EPOCH);
        let Ok(entries) = fs::read_dir(self.directory.as_path()) else { return; };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !(name == "app.log" || name.starts_with("app.log.") || name == "crash.log" || name.starts_with("crash.log.")) { continue; }
            if entry.metadata().and_then(|metadata| metadata.modified()).is_ok_and(|modified| modified < cutoff) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    fn path(&self, filename: &str) -> PathBuf { self.directory.join(filename) }
}
pub fn global() -> Option<&'static Logger> { GLOBAL_LOGGER.get() }
pub fn set_global(logger: Logger) -> Result<(), Logger> { GLOBAL_LOGGER.set(logger) }
fn clean(value: &str) -> String {
    let mut output: String = value.chars().filter(|c| !c.is_control() || *c == '\t').take(2048).collect();
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) { output = output.replace(&home, "<user-home>"); }
    output
}
pub fn timestamp() -> String { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs().to_string() }
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn logger_writes_diagnostic_files_only() {
        let dir = std::env::temp_dir().join(format!("sv-logger-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let logger = Logger::initialize(dir.clone()).unwrap();
        logger.info("test.event", "safe message");
        assert!(dir.join("app.log").exists()); assert!(dir.join("startup.json").exists());
        let record: serde_json::Value = serde_json::from_str(fs::read_to_string(dir.join("app.log")).unwrap().lines().next().unwrap()).unwrap();
        assert_eq!(record["level"], "INFO");
        assert_eq!(record["event"], "application.startup");
        assert_eq!(record["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(record["operatingSystem"], std::env::consts::OS);
        assert!(record["sessionId"].as_str().is_some_and(|id| !id.is_empty()));
        let _ = fs::remove_dir_all(dir);
    }
}
