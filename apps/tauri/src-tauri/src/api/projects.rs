//! Endpoints behind the Library screen. These have no equivalent in apps/editor: the cloud
//! product does this in apps/web server actions (app/dashboard/actions.ts) against Postgres,
//! while here a project is just a folder (see library.rs).

use super::{
    ApiState,
    compile::stream_response,
    files::{attachment, bytes_response},
    meta, str_field,
};
use crate::{
    config,
    error::{ApiError, ApiResult, blocking},
    storage::{Project, copy_recursive},
    tex, zipio,
};
use axum::{
    Json,
    extract::{Multipart, Query, State},
    http::header,
    response::Response,
};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, path::Path, time::SystemTime};

/// (id, name, description). `id` is the folder under `src-tauri/templates/`.
const TEMPLATES: &[(&str, &str, &str)] = &[
    (
        "starter",
        "Starter",
        "A ready-to-compile article with English and Thai fonts set up.",
    ),
    ("blank", "Blank", "A minimal article to start from scratch."),
];

pub async fn list(State(s): State<ApiState>) -> ApiResult<Json<Value>> {
    let library = s.library.clone();
    // The Library screen shows this message with a "Choose another folder" button, so name the
    // folder and the reason (an unplugged drive, a moved folder) instead of a generic 500.
    let projects = blocking(move || {
        library.list().map_err(|e| {
            ApiError::new(
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!(
                    "Can't read the library folder {}: {e}",
                    library.root().display()
                ),
            )
        })
    })
    .await?;
    Ok(Json(json!({ "projects": projects })))
}

pub async fn templates() -> Json<Value> {
    let list: Vec<_> = TEMPLATES
        .iter()
        .map(
            |(id, name, description)| json!({ "id": id, "name": name, "description": description }),
        )
        .collect();
    Json(json!({ "templates": list }))
}

/// Copies a bundled template into a freshly created project folder.
fn seed(templates_dir: &Path, template: &str, dest: &Path) -> ApiResult<()> {
    let known = TEMPLATES.iter().any(|(id, ..)| *id == template);
    let src = templates_dir.join(template);
    if !known || !src.is_dir() {
        return Err(ApiError::bad_request("Unknown template"));
    }
    copy_recursive(&src, dest)?;
    Ok(())
}

pub async fn create(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let name = str_field(&body, "name").unwrap_or_default();
    let template = str_field(&body, "template").unwrap_or_else(|| "starter".to_owned());
    let (library, templates_dir) = (s.library.clone(), s.templates_dir.clone());
    let id = blocking(move || {
        // Validate the template before creating anything, so a bad request leaves no folder behind.
        if !TEMPLATES.iter().any(|(id, ..)| *id == template) {
            return Err(ApiError::bad_request("Unknown template"));
        }
        let id = library.create(&name)?;
        let dir = library.root().join(&id);
        if let Err(e) = seed(&templates_dir, &template, &dir) {
            let _ = fs::remove_dir_all(&dir);
            return Err(e);
        }
        let project = Project::open(dir)?;
        meta::write_initial_prefs(&project, "main.tex")?;
        project.touch();
        Ok(id)
    })
    .await?;
    Ok(Json(json!({ "id": id })))
}

pub async fn rename(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let (id, name) = (
        str_field(&body, "id").unwrap_or_default(),
        str_field(&body, "name").unwrap_or_default(),
    );
    let library = s.library.clone();
    let id = blocking(move || library.rename(&id, &name)).await?;
    Ok(Json(json!({ "id": id })))
}

/// Moves to the trash; nothing is deleted until the trash is purged.
pub async fn delete(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let id = str_field(&body, "id").unwrap_or_default();
    let library = s.library.clone();
    blocking(move || library.trash(&id)).await?;
    Ok(Json(json!({ "success": true })))
}

pub async fn trash_list(State(s): State<ApiState>) -> ApiResult<Json<Value>> {
    let library = s.library.clone();
    let items = blocking(move || {
        library.purge_expired(SystemTime::now());
        Ok(library.list_trash()?)
    })
    .await?;
    Ok(Json(json!({ "items": items })))
}

pub async fn trash_restore(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let id = str_field(&body, "id").unwrap_or_default();
    let library = s.library.clone();
    let id = blocking(move || library.restore(&id)).await?;
    Ok(Json(json!({ "id": id })))
}

pub async fn trash_purge(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let id = str_field(&body, "id").unwrap_or_default();
    let library = s.library.clone();
    blocking(move || library.purge(&id)).await?;
    Ok(Json(json!({ "success": true })))
}

pub async fn import(State(s): State<ApiState>, mut form: Multipart) -> ApiResult<Json<Value>> {
    let mut name = String::new();
    let mut file: Option<(String, Vec<u8>)> = None;
    let err =
        |e: axum::extract::multipart::MultipartError| ApiError::new(e.status(), e.body_text());
    while let Some(field) = form.next_field().await.map_err(err)? {
        match field.name().unwrap_or_default() {
            "name" => name = field.text().await.map_err(err)?,
            "file" => {
                let filename = field.file_name().unwrap_or_default().to_owned();
                file = Some((filename, field.bytes().await.map_err(err)?.to_vec()));
            }
            _ => {}
        }
    }
    let Some((filename, bytes)) = file.filter(|(_, b)| !b.is_empty()) else {
        return Err(ApiError::bad_request("ZIP file is required"));
    };
    // The project takes the typed name, else the zip's own name ("thesis.zip" -> "thesis").
    let wanted = if name.trim().is_empty() {
        filename
            .strip_suffix(".zip")
            .or(filename.strip_suffix(".ZIP"))
            .unwrap_or(&filename)
            .to_owned()
    } else {
        name
    };

    let library = s.library.clone();
    let id = blocking(move || {
        let id = library.create(if wanted.trim().is_empty() {
            "Imported project"
        } else {
            &wanted
        })?;
        let dir = library.root().join(&id);
        let result = Project::open(dir.clone())
            .map_err(ApiError::from)
            .and_then(|project| zipio::import_zip(&project, &bytes));
        if let Err(e) = result {
            let _ = fs::remove_dir_all(&dir); // never leave a half-imported project behind
            return Err(e);
        }
        Ok(id)
    })
    .await?;
    Ok(Json(json!({ "id": id })))
}

pub async fn export(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let project = s.library.project(q.get("id").map(String::as_str))?;
    let filename = format!("{}.zip", q["id"]);
    let bytes = blocking(move || zipio::export_zip(&project)).await?;
    Ok(bytes_response(
        bytes,
        &[
            (header::CONTENT_TYPE, "application/zip".into()),
            (header::CONTENT_DISPOSITION, attachment(&filename)),
        ],
    ))
}

pub async fn settings_get(State(s): State<ApiState>) -> Json<Value> {
    Json(json!({ "libraryPath": s.library.root() }))
}

pub async fn settings_post(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let path = str_field(&body, "libraryPath")
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_absolute())
        .ok_or_else(|| ApiError::bad_request("libraryPath must be an absolute path"))?;
    let (library, config_path) = (s.library.clone(), s.config_path.clone());
    let root = blocking(move || {
        fs::create_dir_all(&path)
            .map_err(|e| ApiError::bad_request(format!("Can't use that folder: {e}")))?;
        let root = path.canonicalize()?;
        if let Some(config_path) = config_path {
            config::save(
                &config_path,
                &config::Config {
                    library_path: Some(root.clone()),
                },
            )?;
        }
        library.set_root(root.clone());
        library.purge_expired(SystemTime::now());
        Ok(root)
    })
    .await?;
    Ok(Json(json!({ "libraryPath": root })))
}

/// Compiles a small document that pulls in the usual packages, so the TeX files they need
/// are cached and later compiles work without a connection. Streams like /api/compile.
pub async fn prepare_offline(State(s): State<ApiState>) -> ApiResult<Response> {
    let tex = s.tex.clone();
    let rx = blocking(move || {
        let dir = std::env::temp_dir().join("somescript-warmup");
        fs::create_dir_all(&dir)?;
        let project = Project::open(dir)?;
        project.write("warmup.tex", WARMUP_DOC.as_bytes())?;
        tex::start_compile(tex, &project, "warmup.tex")
    })
    .await?;
    Ok(stream_response(rx))
}

// Same package list the cloud compiler warms its image with (apps/compiler/Dockerfile), plus
// what the Starter template loads.
const WARMUP_DOC: &str = r"\documentclass{article}
\usepackage{amsmath,amssymb,graphicx,hyperref,geometry,booktabs,microtype}
\usepackage{fontspec,polyglossia,ucharclasses,xcolor,enumitem}
\begin{document}
Warming the package cache.
\end{document}
";
