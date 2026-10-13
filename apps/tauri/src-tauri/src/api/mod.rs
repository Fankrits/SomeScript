//! The `/api/*` contract apps/editor's UI already speaks. Each submodule documents the
//! Next route handler it is a port of; keep response shapes identical to those.

mod compile;
mod files;
mod meta;
mod search;

#[cfg(test)]
mod http_tests;

use crate::{library::Library, tex::TexTools};
use axum::{
    Router,
    extract::{DefaultBodyLimit, FromRef},
    routing::{get, post},
};
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiState {
    pub library: Arc<Library>,
    pub tex: Arc<TexTools>,
}

pub fn router<S>() -> Router<S>
where
    ApiState: FromRef<S>,
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route(
            "/api/files",
            get(files::get)
                .post(files::post)
                .layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route(
            "/api/files/upload",
            post(files::upload).layer(DefaultBodyLimit::max(files::MAX_UPLOAD_BYTES + 1024 * 1024)),
        )
        .route("/api/compile", post(compile::compile))
        .route("/api/synctex", post(compile::synctex))
        .route("/api/search", get(search::get).post(search::post))
        .route("/api/tasks", get(meta::tasks_get).post(meta::tasks_post))
        .route(
            "/api/project-settings",
            get(meta::settings_get).post(meta::settings_post),
        )
        .route(
            "/api/editor-prefs",
            get(meta::prefs_get).put(meta::prefs_put),
        )
        .route("/api/project/name", get(meta::project_name))
}

/// JS truthiness for the few request fields the Next routes test that way (`if (body.isDir)`).
pub(crate) fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

pub(crate) fn str_field(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(Value::as_str).map(str::to_owned)
}
