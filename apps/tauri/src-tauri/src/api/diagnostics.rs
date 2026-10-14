//! `GET /api/diagnostics`: a plain-text report to paste into a bug report. Desktop only.
//!
//! It says where things are and what state they are in, which is what a "can't create a project"
//! report needs and what a user can't read off a release build that has no console. It never
//! includes API keys, chat history or the contents of any project file.

use super::ApiState;
use crate::{
    config,
    error::{ApiResult, Os, blocking},
    library::check_folder,
};
use axum::{
    extract::State,
    http::header,
    response::{IntoResponse, Response},
};
use std::{fmt::Write as _, fs, path::Path};

pub async fn get(State(s): State<ApiState>) -> ApiResult<Response> {
    let text = blocking(move || Ok(report(&s))).await?;
    Ok((
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        text,
    )
        .into_response())
}

fn report(s: &ApiState) -> String {
    let mut out = String::new();
    // Writing to a String can't fail.
    let mut line = |text: String| {
        let _ = writeln!(out, "{text}");
    };
    let root = s.library.root();
    let check = check_folder(&root, Os::CURRENT);
    let saved = s
        .config_path
        .as_deref()
        .map(config::load)
        .unwrap_or_default();

    line(format!("SomeScript {}", env!("CARGO_PKG_VERSION")));
    line(format!(
        "Platform: {} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    line(format!(
        "WebView: {}",
        s.webview_version.as_deref().unwrap_or("unknown")
    ));
    line(String::new());
    line(format!(
        "Library: {} (chosen by: {:?})",
        check.path,
        s.library.source()
    ));
    line(format!(
        "  exists: {}, writable: {}, creatable: {}, projects: {}",
        check.exists, check.writable, check.creatable, check.project_count
    ));
    if let Some(issue) = &check.issue {
        line(format!("  problem: {}", issue.message));
        if let Some(hint) = &issue.hint {
            line(format!("  hint: {hint}"));
        }
    }
    for warning in &check.warnings {
        line(format!("  note: {}", warning.message));
    }
    line(format!(
        "Default library: {}",
        dunce::simplified(&s.default_library).display()
    ));
    line(format!(
        "Setup done: {} (saved folder: {})",
        saved.onboarded,
        saved
            .library_path
            .as_deref()
            .map_or("none".to_owned(), |p| p.display().to_string())
    ));
    line(String::new());
    let (tectonic, synctex) = s.tex.paths();
    for (name, path) in [("tectonic", tectonic), ("synctex", synctex)] {
        let state = if path.components().count() > 1 {
            if path.is_file() { "found" } else { "NOT FOUND" }
        } else {
            "looked up on PATH"
        };
        line(format!("{name}: {} ({state})", path.display()));
    }
    line(String::new());
    match &s.log_dir {
        Some(dir) => {
            line(format!("Log folder: {}", dir.display()));
            if let Some(tail) = log_tail(dir, 80) {
                line("--- last lines of somescript.log ---".to_owned());
                line(tail);
            }
        }
        None => line("Log folder: unknown".to_owned()),
    }
    out
}

/// The last `lines` lines of the current log file (reads at most its final 64 KB).
fn log_tail(dir: &Path, lines: usize) -> Option<String> {
    let bytes = fs::read(dir.join("somescript.log")).ok()?;
    let start = bytes.len().saturating_sub(64 * 1024);
    let text = String::from_utf8_lossy(&bytes[start..]).into_owned();
    let all: Vec<&str> = text.lines().collect();
    Some(all[all.len().saturating_sub(lines)..].join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_log_tail_is_the_end_of_the_file() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(log_tail(dir.path(), 3), None);
        let lines: Vec<String> = (1..=10).map(|n| format!("line {n}")).collect();
        fs::write(dir.path().join("somescript.log"), lines.join("\n")).unwrap();
        assert_eq!(log_tail(dir.path(), 3).unwrap(), "line 8\nline 9\nline 10");
    }
}
