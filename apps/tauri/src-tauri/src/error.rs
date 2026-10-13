//! Same wire format as apps/editor/lib/authz.ts `apiError`: `{ "error": "<message>" }` + status.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }
    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }
    /// Unknown failures are logged and reported generically, like the cloud editor does.
    pub fn internal(detail: impl std::fmt::Display) -> Self {
        eprintln!("[api] {detail}");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}

impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind::*;
        match e.kind() {
            NotFound => Self::not_found("File not found"),
            // A local app's users can fix these themselves, so say what is wrong.
            PermissionDenied => Self::new(
                StatusCode::FORBIDDEN,
                "Permission denied: SomeScript isn't allowed to use that folder.",
            ),
            StorageFull => Self::new(StatusCode::INSUFFICIENT_STORAGE, "Your disk is full."),
            ReadOnlyFilesystem => Self::new(StatusCode::FORBIDDEN, "That folder is read-only."),
            _ => Self::internal(e),
        }
    }
}

/// Runs blocking filesystem work off the async runtime and flattens the join error.
pub async fn blocking<T, F>(f: F) -> ApiResult<T>
where
    F: FnOnce() -> ApiResult<T> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(ApiError::internal)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind};

    #[test]
    fn io_failures_a_user_can_fix_get_actionable_messages() {
        let cases = [
            (ErrorKind::NotFound, StatusCode::NOT_FOUND, "File not found"),
            (
                ErrorKind::PermissionDenied,
                StatusCode::FORBIDDEN,
                "Permission denied",
            ),
            (
                ErrorKind::StorageFull,
                StatusCode::INSUFFICIENT_STORAGE,
                "disk is full",
            ),
            (
                ErrorKind::ReadOnlyFilesystem,
                StatusCode::FORBIDDEN,
                "read-only",
            ),
        ];
        for (kind, status, fragment) in cases {
            let e = ApiError::from(Error::from(kind));
            assert_eq!(e.status, status, "{kind:?}");
            assert!(e.message.contains(fragment), "{kind:?}: {}", e.message);
        }
        // Anything else stays generic: don't leak paths or OS internals from unknown failures.
        let e = ApiError::from(Error::other("secret path /Users/x"));
        assert_eq!(
            (e.status, e.message.as_str()),
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
        );
    }
}
