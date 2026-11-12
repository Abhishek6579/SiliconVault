use serde::Serialize;
use std::{error::Error, fmt};
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError { pub code: &'static str, pub message: String, pub recoverable: bool }
impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>, recoverable: bool) -> Self { Self { code, message: message.into(), recoverable } }
    pub fn io(context: &str, error: &std::io::Error) -> Self { Self::new("IO_ERROR", format!("{context}: {error}"), true) }
    pub fn log(&self) { if let Some(logger) = crate::logger::global() { logger.error(self.code, &self.message); } }
    pub fn into_command_error(self) -> String { self.log(); format!("{}: {}", self.code, self.message) }
}
impl fmt::Display for AppError { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { write!(f, "{}: {}", self.code, self.message) } }
impl Error for AppError {}
pub type AppResult<T> = Result<T, AppError>;
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn error_exposes_code_and_recovery_flag() {
        let error = AppError::new("DIAGNOSTICS_READ_FAILED", "Unable to read log", true);
        assert_eq!(error.code, "DIAGNOSTICS_READ_FAILED"); assert!(error.recoverable);
    }
}
