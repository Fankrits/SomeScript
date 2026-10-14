//! Same wire format as apps/editor/lib/authz.ts `apiError`: `{ "error": "<message>" }` + status.
//! The desktop app adds an optional `"hint"` (what the user can do about it) for folder problems.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::{io, path::Path};

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    /// What the user can try. Only folder-level failures carry one.
    pub hint: Option<String>,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            hint: None,
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
        log::error!("[api] {detail}");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
    }

    /// A folder operation that failed: what was being done, where, why, and what to try next.
    /// Unlike `From<io::Error>` (made for the editor's file routes, where a missing file is a plain
    /// 404) this never answers a bare "File not found": a user staring at that has no idea which
    /// folder, or what to do. The full OS error goes to the log.
    pub fn io_at(action: &str, path: &Path, e: &io::Error) -> Self {
        let ex = explain(e.kind(), e.raw_os_error(), Os::CURRENT, Some(path));
        let shown = dunce::simplified(path).display();
        log::warn!(
            "{action} ({shown}): {e} [{:?}, os error {:?}]",
            e.kind(),
            e.raw_os_error()
        );
        Self {
            status: ex.status,
            message: format!("{action} ({shown}). {}", ex.message),
            hint: ex.hint,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut body = serde_json::json!({ "error": self.message });
        if let Some(hint) = self.hint {
            body["hint"] = hint.into();
        }
        (self.status, Json(body)).into_response()
    }
}

impl From<io::Error> for ApiError {
    fn from(e: io::Error) -> Self {
        // The editor's file routes promise a plain 404 for a missing file.
        if e.kind() == io::ErrorKind::NotFound {
            return Self::not_found("File not found");
        }
        let ex = explain(e.kind(), e.raw_os_error(), Os::CURRENT, None);
        if ex.status == StatusCode::INTERNAL_SERVER_ERROR {
            log::error!(
                "[api] {e} [{:?}, os error {:?}]",
                e.kind(),
                e.raw_os_error()
            );
        }
        Self::new(ex.status, ex.message)
    }
}

/// Where we run, for platform-specific advice. A value rather than `cfg!` at the call site so every
/// platform's wording can be unit-tested on any machine.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Os {
    Windows,
    Mac,
    Other,
}

impl Os {
    pub const CURRENT: Os = if cfg!(windows) {
        Os::Windows
    } else if cfg!(target_os = "macos") {
        Os::Mac
    } else {
        Os::Other
    };
}

/// A file-system failure in words a person can act on.
#[derive(Debug, PartialEq)]
pub struct Explained {
    pub status: StatusCode,
    pub message: String,
    pub hint: Option<String>,
}

fn explained(status: StatusCode, message: &str, hint: Option<&str>) -> Explained {
    Explained {
        status,
        message: message.to_owned(),
        hint: hint.map(str::to_owned),
    }
}

/// Windows protects `Documents`, `Desktop`, `Pictures`, `Videos` and `Music` with "Controlled folder
/// access" when it is on (also when they are redirected into OneDrive). Works on the path as text,
/// so a Windows path is recognised no matter which OS runs the check.
pub fn in_windows_protected_folder(path: &Path) -> bool {
    const PROTECTED: [&str; 5] = ["documents", "desktop", "pictures", "videos", "music"];
    let text = path.to_string_lossy().to_lowercase();
    let parts: Vec<&str> = text.split(['\\', '/']).filter(|p| !p.is_empty()).collect();
    let Some(users) = parts.iter().position(|p| *p == "users") else {
        return false;
    };
    // <drive>:\Users\<name>\<folder>  or  <drive>:\Users\<name>\OneDrive[ - Org]\<folder>
    match parts.get(users + 2..).unwrap_or_default() {
        [first, ..] if PROTECTED.contains(first) => true,
        [first, second, ..] => first.starts_with("onedrive") && PROTECTED.contains(second),
        _ => false,
    }
}

/// Maps an I/O failure to a status, a sentence and (where there is one) a next step.
/// Windows reports many different problems as a handful of `ErrorKind`s, so its raw codes say
/// more than the kind does.
pub fn explain(kind: io::ErrorKind, raw: Option<i32>, os: Os, path: Option<&Path>) -> Explained {
    use io::ErrorKind::*;
    let win = |codes: &[i32]| os == Os::Windows && raw.is_some_and(|r| codes.contains(&r));

    // ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
    if win(&[32, 33]) {
        return explained(
            StatusCode::CONFLICT,
            "The folder is in use by another program.",
            Some(
                "Antivirus software, OneDrive and Explorer can hold files for a moment. \
                 Wait a few seconds and try again.",
            ),
        );
    }
    // ERROR_BAD_NETPATH, ERROR_BAD_NET_NAME
    if win(&[53, 67]) {
        return explained(
            StatusCode::INTERNAL_SERVER_ERROR,
            "That network location isn't reachable.",
            Some("Check your connection, or choose a folder on this computer."),
        );
    }
    // ERROR_INVALID_DRIVE
    if win(&[15]) {
        return explained(
            StatusCode::INTERNAL_SERVER_ERROR,
            "That drive isn't available.",
            Some("Connect it, or choose a folder on a drive that is."),
        );
    }
    // ERROR_INVALID_NAME, ERROR_BAD_PATHNAME, ERROR_FILENAME_EXCED_RANGE
    if win(&[123, 161, 206]) {
        return explained(
            StatusCode::BAD_REQUEST,
            "Windows doesn't accept that path (invalid characters, or too long).",
            Some("Choose a shorter path without special characters."),
        );
    }
    // ERROR_DIRECTORY, ERROR_WRITE_PROTECT
    if win(&[267]) || kind == NotADirectory {
        return explained(
            StatusCode::BAD_REQUEST,
            "That path isn't a folder.",
            Some("Choose a folder."),
        );
    }
    if win(&[19]) || kind == ReadOnlyFilesystem {
        return explained(
            StatusCode::FORBIDDEN,
            "That folder is read-only.",
            Some("Choose a folder you can write to."),
        );
    }

    match kind {
        PermissionDenied => {
            let hint = match os {
                Os::Windows if path.is_some_and(in_windows_protected_folder) => {
                    "Windows Security's Controlled folder access may be blocking SomeScript from \
                     this folder. Choose a folder outside Documents, Desktop and Pictures, or \
                     allow SomeScript: Windows Security > Virus & threat protection > Ransomware \
                     protection > Allow an app through Controlled folder access, then restart \
                     SomeScript."
                }
                Os::Windows => {
                    "Check that your account can write to this folder and that antivirus \
                     software isn't blocking SomeScript, or choose another folder."
                }
                Os::Mac => {
                    "macOS may be blocking access. In System Settings > Privacy & Security > \
                     Files & Folders (or Full Disk Access) allow SomeScript, or choose another \
                     folder."
                }
                Os::Other => "Check the folder's permissions, or choose another folder.",
            };
            explained(
                StatusCode::FORBIDDEN,
                "Permission denied: SomeScript isn't allowed to use that folder.",
                Some(hint),
            )
        }
        NotFound => explained(
            StatusCode::INTERNAL_SERVER_ERROR,
            "That folder doesn't exist.",
            Some(
                "If it is on a drive or network share, reconnect it. Otherwise choose another folder.",
            ),
        ),
        AlreadyExists => explained(
            StatusCode::CONFLICT,
            "A file with that name is already in the way.",
            Some("Choose another name or folder."),
        ),
        StorageFull => explained(
            StatusCode::INSUFFICIENT_STORAGE,
            "Your disk is full.",
            Some("Free some space and try again."),
        ),
        _ => Explained {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            // The number helps a bug report; the OS's own text can carry paths, so it stays in the log.
            message: match raw {
                Some(n) => format!("Unexpected file system error (os error {n})."),
                None => "Unexpected file system error.".to_owned(),
            },
            hint: None,
        },
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
    use io::{Error, ErrorKind};

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
        // Anything else says only that something unexpected happened (plus the OS error number):
        // the OS's own text can carry paths, and a custom error's message is nobody's business.
        let e = ApiError::from(Error::other("secret path /Users/x"));
        assert_eq!(
            (e.status, e.message.as_str()),
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unexpected file system error."
            )
        );
        let e = ApiError::from(Error::from_raw_os_error(if cfg!(windows) {
            1117
        } else {
            5
        }));
        assert!(
            e.message
                .starts_with("Unexpected file system error (os error "),
            "{}",
            e.message
        );
    }

    #[test]
    fn a_folder_failure_names_the_action_the_path_and_never_says_file_not_found() {
        let missing = Error::from(ErrorKind::NotFound);
        let e = ApiError::io_at(
            "Couldn't create the project folder",
            Path::new("/data/SomeScript/Paper"),
            &missing,
        );
        assert!(
            e.message.contains("Couldn't create the project folder"),
            "{}",
            e.message
        );
        assert!(e.message.contains("SomeScript"), "{}", e.message);
        assert!(!e.message.contains("File not found"), "{}", e.message);
        assert_eq!(e.status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(e.hint.is_some());
    }

    #[test]
    fn windows_codes_say_what_actually_went_wrong() {
        let win = |kind, code| explain(kind, Some(code), Os::Windows, None);
        // ERROR_PATH_NOT_FOUND is what creating a folder inside a missing one returns.
        assert!(
            win(ErrorKind::NotFound, 3)
                .message
                .contains("doesn't exist")
        );
        assert!(
            win(ErrorKind::Other, 32)
                .message
                .contains("in use by another program")
        );
        assert!(
            win(ErrorKind::Other, 33)
                .message
                .contains("in use by another program")
        );
        assert!(
            win(ErrorKind::Other, 53)
                .message
                .contains("network location")
        );
        assert!(
            win(ErrorKind::Other, 15)
                .message
                .contains("drive isn't available")
        );
        assert!(
            win(ErrorKind::Other, 123)
                .message
                .contains("doesn't accept that path")
        );
        assert!(
            win(ErrorKind::Other, 206)
                .message
                .contains("doesn't accept that path")
        );
        assert!(
            win(ErrorKind::Other, 267)
                .message
                .contains("isn't a folder")
        );
        assert!(win(ErrorKind::Other, 19).message.contains("read-only"));
        // The same raw numbers mean something else elsewhere: only Windows reads them this way.
        let other = explain(ErrorKind::Other, Some(32), Os::Other, None);
        assert!(
            other.message.starts_with("Unexpected file system error"),
            "{}",
            other.message
        );
    }

    #[test]
    fn a_permission_hint_names_the_windows_feature_that_usually_causes_it() {
        let p = |path: &str| {
            explain(
                ErrorKind::PermissionDenied,
                Some(5),
                Os::Windows,
                Some(Path::new(path)),
            )
        };
        for protected in [
            r"C:\Users\Ann\Documents\SomeScript",
            r"C:\Users\Ann\OneDrive\Documents\SomeScript",
            r"C:\Users\Ann\Desktop\Thesis",
            "C:/Users/Ann/Pictures/x",
        ] {
            let hint = p(protected).hint.unwrap();
            assert!(
                hint.contains("Controlled folder access"),
                "{protected}: {hint}"
            );
            assert!(hint.contains("Allow an app through"), "{protected}: {hint}");
        }
        for plain in [
            r"C:\SomeScript",
            r"D:\Work\Documents\x",
            r"C:\Users\Ann\SomeScript",
        ] {
            let hint = p(plain).hint.unwrap();
            assert!(
                !hint.contains("Controlled folder access"),
                "{plain}: {hint}"
            );
            assert!(hint.contains("antivirus"), "{plain}: {hint}");
        }
        let mac = explain(ErrorKind::PermissionDenied, Some(1), Os::Mac, None);
        assert!(mac.hint.unwrap().contains("Privacy & Security"));
        let linux = explain(ErrorKind::PermissionDenied, Some(13), Os::Other, None);
        assert!(linux.hint.unwrap().contains("permissions"));
    }

    #[tokio::test]
    async fn the_response_carries_the_hint_only_when_there_is_one() {
        async fn body(e: ApiError) -> serde_json::Value {
            let bytes = axum::body::to_bytes(e.into_response().into_body(), usize::MAX)
                .await
                .unwrap();
            serde_json::from_slice(&bytes).unwrap()
        }
        assert_eq!(
            body(ApiError::bad_request("nope")).await,
            serde_json::json!({ "error": "nope" }),
            "the editor's wire format is unchanged when there is no hint"
        );
        let hinted = body(ApiError::io_at(
            "Couldn't create the library folder",
            Path::new("/x"),
            &Error::from(ErrorKind::PermissionDenied),
        ))
        .await;
        assert!(
            hinted["error"]
                .as_str()
                .unwrap()
                .starts_with("Couldn't create the library folder (/x)."),
            "{hinted}"
        );
        assert!(hinted["hint"].is_string(), "{hinted}");
    }
}
