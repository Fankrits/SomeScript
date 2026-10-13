//! The `/api/*` contract apps/editor's UI already speaks. Each submodule documents the
//! Next route handler it is a port of; keep response shapes identical to those.

mod ai;
mod compile;
mod files;
pub(crate) mod meta;
mod projects;
pub(crate) mod search;

#[cfg(test)]
mod http_tests;

use crate::{
    ai::{AiHttp, settings::AiStore},
    library::Library,
    tex::TexTools,
};
use axum::{
    Router,
    extract::{DefaultBodyLimit, FromRef},
    routing::{get, post},
};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};

#[derive(Clone)]
pub struct ApiState {
    pub library: Arc<Library>,
    pub tex: Arc<TexTools>,
    /// Bundled project templates (`src-tauri/templates`, shipped as app resources).
    pub templates_dir: PathBuf,
    /// Where the chosen library folder is remembered; `None` in tests.
    pub config_path: Option<PathBuf>,
    /// Global AI settings (providers and keys), shared by every project.
    pub ai: Arc<AiStore>,
    pub http: AiHttp,
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
        // Library screen (desktop only)
        .route("/api/projects", get(projects::list).post(projects::create))
        .route("/api/projects/rename", post(projects::rename))
        .route("/api/projects/delete", post(projects::delete))
        .route(
            "/api/projects/import",
            post(projects::import).layer(DefaultBodyLimit::max(
                crate::zipio::MAX_UPLOAD_BYTES + 1024 * 1024,
            )),
        )
        .route("/api/projects/export", get(projects::export))
        .route("/api/templates", get(projects::templates))
        .route("/api/trash", get(projects::trash_list))
        .route("/api/trash/restore", post(projects::trash_restore))
        .route("/api/trash/purge", post(projects::trash_purge))
        .route(
            "/api/settings",
            get(projects::settings_get).post(projects::settings_post),
        )
        .route("/api/prepare-offline", post(projects::prepare_offline))
        // AI assistant (desktop only): global provider settings, streaming chat, per-project history
        .route(
            "/api/ai/settings",
            get(ai::settings_get).post(ai::settings_post),
        )
        .route("/api/ai/providers", post(ai::provider_save))
        .route("/api/ai/providers/delete", post(ai::provider_delete))
        .route("/api/ai/providers/test", post(ai::provider_test))
        .route(
            "/api/ai/chat",
            post(ai::chat).layer(DefaultBodyLimit::max(CHAT_BODY_LIMIT)),
        )
        .route(
            "/api/chat/threads",
            get(ai::threads_get).put(ai::threads_put),
        )
        .route(
            "/api/chat/thread",
            get(ai::thread_get)
                .put(ai::thread_put)
                .delete(ai::thread_delete)
                .layer(DefaultBodyLimit::max(CHAT_BODY_LIMIT)),
        )
}

/// A conversation carries file diffs and compile logs; the default 2 MB is too small for a long one.
const CHAT_BODY_LIMIT: usize = 32 * 1024 * 1024;

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
