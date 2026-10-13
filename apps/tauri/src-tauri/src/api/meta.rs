//! Ports of apps/editor/app/api/{tasks,project-settings,editor-prefs,project/name}/route.ts
//! and their sanitizers (lib/tasks.ts, lib/project-settings.ts, lib/editor-prefs-storage.ts).
//! All of it is small JSON under `.somescript/`, coerced on every read and write so a
//! hand-edited file can't break the UI.

use super::{ApiState, truthy};
use crate::{
    error::{ApiError, ApiResult, blocking},
    storage::Project,
};
use axum::{
    Json,
    extract::{Query, State},
};
use serde_json::{Map, Value, json};
use std::{collections::HashMap, time::SystemTime};

const TASKS_PATH: &str = ".somescript/tasks.json";
const SETTINGS_PATH: &str = ".somescript/project-settings.json";
/// The cloud editor keys prefs by Clerk user id; the desktop app has exactly one user.
const PREFS_PATH: &str = ".somescript/editor-prefs/local.json";

const MAX_TASKS: usize = 500;
const MAX_NAME: usize = 200;
const MAX_DESCRIPTION: usize = 5000;

// ponytail: clipping counts chars, the cloud editor counts UTF-16 units. Differs only past the limits.
fn clip(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn project_id(q: &HashMap<String, String>) -> Option<&str> {
    q.get("projectId").map(String::as_str)
}

/// Missing or unreadable file -> `None`, so each caller falls back to its defaults.
fn read_json(project: &Project, path: &str) -> Option<Value> {
    serde_json::from_str(&project.read_text(path).ok()?).ok()
}

// ---- tasks -----------------------------------------------------------------------------

fn sanitize_source(input: Option<&Value>) -> Option<Value> {
    let s = input?.as_object()?;
    let mut out = Map::new();
    if let Some(p) = s.get("path").filter(|v| v.is_string()) {
        out.insert("path".into(), p.clone());
    }
    for key in ["line", "endLine", "page"] {
        if let Some(n) = s.get(key).filter(|v| v.is_number()) {
            out.insert(key.into(), n.clone());
        }
    }
    (!out.is_empty()).then(|| Value::Object(out))
}

pub fn sanitize_tasks(input: &Value) -> Vec<Value> {
    let Some(entries) = input.as_array() else {
        return Vec::new();
    };
    let mut tasks = Vec::new();
    for entry in entries {
        let Some(t) = entry.as_object() else { continue };
        let (Some(id), Some(name)) = (
            t.get("id").and_then(Value::as_str),
            t.get("name").and_then(Value::as_str),
        ) else {
            continue;
        };
        let done = truthy(t.get("done"));
        let status = match t.get("status").and_then(Value::as_str) {
            Some(s @ ("todo" | "ongoing" | "finished")) => s,
            _ if done => "finished",
            _ => "todo",
        };
        let mut task = Map::new();
        task.insert("id".into(), json!(id));
        task.insert("name".into(), json!(clip(name, MAX_NAME)));
        task.insert("done".into(), json!(done));
        task.insert("status".into(), json!(status));
        task.insert(
            "createdAt".into(),
            t.get("createdAt")
                .filter(|v| v.is_number())
                .cloned()
                .unwrap_or(json!(now_ms())),
        );
        if let Some(source) = sanitize_source(t.get("source")) {
            task.insert("source".into(), source);
        }
        if let Some(d) = t
            .get("description")
            .and_then(Value::as_str)
            .filter(|d| !d.is_empty())
        {
            task.insert("description".into(), json!(clip(d, MAX_DESCRIPTION)));
        }
        tasks.push(Value::Object(task));
        if tasks.len() >= MAX_TASKS {
            break;
        }
    }
    tasks
}

pub async fn tasks_get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = s.library.project(project_id(&q))?;
    let tasks = blocking(move || {
        Ok(read_json(&project, TASKS_PATH)
            .map(|v| sanitize_tasks(&v))
            .unwrap_or_default())
    })
    .await?;
    Ok(Json(json!({ "tasks": tasks })))
}

pub async fn tasks_post(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let tasks = body.get("tasks").filter(|t| t.is_array());
    let Some(tasks) = tasks else {
        return Err(ApiError::bad_request("Missing tasks"));
    };
    let sanitized = serde_json::to_vec(&sanitize_tasks(tasks)).map_err(ApiError::internal)?;
    // ponytail: whole-list overwrite, last writer wins (same as the cloud editor).
    blocking(move || project.write(TASKS_PATH, &sanitized)).await?;
    Ok(Json(json!({ "success": true })))
}

// ---- project settings --------------------------------------------------------------------

pub fn sanitize_settings(input: Option<&Value>) -> Value {
    let s = input.and_then(Value::as_object);
    let main_file = s
        .and_then(|s| s.get("mainFilePath"))
        .and_then(Value::as_str)
        .filter(|p| !p.is_empty() && p.chars().count() <= 1024)
        .unwrap_or("main.tex");
    let engine = s
        .and_then(|s| s.get("compilerEngine"))
        .and_then(Value::as_str)
        .filter(|e| e.chars().count() <= 64)
        .unwrap_or("tectonic");
    json!({ "mainFilePath": main_file, "compilerEngine": engine })
}

pub async fn settings_get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = s.library.project(project_id(&q))?;
    let settings = blocking(move || {
        Ok(sanitize_settings(
            read_json(&project, SETTINGS_PATH).as_ref(),
        ))
    })
    .await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn settings_post(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let settings = sanitize_settings(body.get("settings"));
    let bytes = serde_json::to_vec(&settings).map_err(ApiError::internal)?;
    blocking(move || project.write(SETTINGS_PATH, &bytes)).await?;
    Ok(Json(json!({ "success": true, "settings": settings })))
}

// ---- editor prefs ------------------------------------------------------------------------

pub fn sanitize_prefs(input: Option<&Value>) -> Value {
    let raw = input.and_then(Value::as_object);
    let flag = |key: &str, default: bool| {
        raw.and_then(|r| r.get(key))
            .and_then(Value::as_bool)
            .unwrap_or(default)
    };
    let last_open = raw
        .and_then(|r| r.get("lastOpenFile"))
        .and_then(Value::as_str)
        .map(|p| clip(p, 2000));
    json!({
        "tooltipsEnabled": flag("tooltipsEnabled", true),
        "vimModeEnabled": flag("vimModeEnabled", false),
        "foldingEnabled": flag("foldingEnabled", true),
        "autocompleteEnabled": flag("autocompleteEnabled", true),
        "bracketMatchingEnabled": flag("bracketMatchingEnabled", true),
        "autoCompileEnabled": flag("autoCompileEnabled", true),
        "lastOpenFile": last_open,
    })
}

pub async fn prefs_get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = s.library.project(project_id(&q))?;
    let prefs =
        blocking(move || Ok(sanitize_prefs(read_json(&project, PREFS_PATH).as_ref()))).await?;
    Ok(Json(json!({ "prefs": prefs })))
}

/// Merge-on-write: the settings toggles and the last-open-file pointer are saved from two
/// independent places in the UI, so each sends only what it changed.
pub async fn prefs_put(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let incoming = body.get("prefs").cloned();
    let merged = blocking(move || {
        let mut merged = sanitize_prefs(read_json(&project, PREFS_PATH).as_ref());
        if let (Some(base), Some(Value::Object(patch))) = (merged.as_object_mut(), incoming) {
            base.extend(patch);
        }
        let merged = sanitize_prefs(Some(&merged));
        let bytes = serde_json::to_vec(&merged).map_err(ApiError::internal)?;
        project.write(PREFS_PATH, &bytes)?;
        Ok(merged)
    })
    .await?;
    Ok(Json(json!({ "success": true, "prefs": merged })))
}

// ---- project name ------------------------------------------------------------------------

/// The name of a desktop project is its folder name.
pub async fn project_name(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let id = project_id(&q).map(str::to_owned);
    s.library.project(id.as_deref())?;
    Ok(Json(json!({ "name": id })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tasks_drop_invalid_entries_and_infer_status() {
        let out = sanitize_tasks(&json!([
            { "id": "a", "name": "write", "done": true },
            { "id": "b", "name": "read", "status": "ongoing", "createdAt": 5 },
            { "id": "c", "name": "x", "status": "bogus" },
            { "id": 1, "name": "no string id" },
            "not an object",
            { "id": "d", "name": "n".repeat(300), "description": "", "source": { "line": 4, "junk": 1 } },
            { "id": "e", "name": "empty source", "source": { "junk": 1 } },
        ]));
        let by = |id: &str| out.iter().find(|t| t["id"] == id).unwrap();
        assert_eq!(out.len(), 5);
        assert_eq!(by("a")["status"], "finished");
        assert_eq!(by("b")["status"], "ongoing");
        assert_eq!(by("b")["createdAt"], 5);
        assert_eq!(by("c")["status"], "todo");
        assert!(by("a")["createdAt"].is_number());
        assert_eq!(by("d")["name"].as_str().unwrap().chars().count(), 200);
        assert!(by("d").get("description").is_none());
        assert_eq!(by("d")["source"], json!({ "line": 4 }));
        assert!(by("e").get("source").is_none());
        assert!(sanitize_tasks(&json!({ "not": "an array" })).is_empty());
    }

    #[test]
    fn tasks_are_capped() {
        let many: Vec<_> = (0..600)
            .map(|i| json!({ "id": i.to_string(), "name": "t" }))
            .collect();
        assert_eq!(sanitize_tasks(&Value::Array(many)).len(), MAX_TASKS);
    }

    #[test]
    fn settings_fall_back_to_defaults() {
        let default = json!({ "mainFilePath": "main.tex", "compilerEngine": "tectonic" });
        assert_eq!(sanitize_settings(None), default);
        assert_eq!(
            sanitize_settings(Some(&json!({ "mainFilePath": "" }))),
            default
        );
        assert_eq!(
            sanitize_settings(Some(
                &json!({ "mainFilePath": "thesis/main.tex", "compilerEngine": 3 })
            ))["mainFilePath"],
            "thesis/main.tex"
        );
    }

    #[test]
    fn prefs_default_and_coerce() {
        let p = sanitize_prefs(None);
        assert_eq!(p["tooltipsEnabled"], true);
        assert_eq!(p["vimModeEnabled"], false);
        assert_eq!(p["lastOpenFile"], Value::Null);
        let p = sanitize_prefs(Some(
            &json!({ "vimModeEnabled": "yes", "lastOpenFile": "a.tex" }),
        ));
        assert_eq!(p["vimModeEnabled"], false); // wrong type -> default
        assert_eq!(p["lastOpenFile"], "a.tex");
    }
}
