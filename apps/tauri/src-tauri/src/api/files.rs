//! Port of apps/editor/app/api/files/route.ts and app/api/files/upload/route.ts.

use super::{ApiState, str_field, truthy};
use crate::{
    error::{ApiError, ApiResult, blocking},
    storage::{Project, dedupe_upload_name, flatten_file_paths, is_binary_content},
};
use axum::{
    Json,
    body::Body,
    extract::{Multipart, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

/// 250 MB, matching MAX_UPLOAD_BYTES in apps/editor/lib/zip.ts.
pub const MAX_UPLOAD_BYTES: usize = 250 * 1024 * 1024;

const FILENAME_ATTR: &AsciiSet = &NON_ALPHANUMERIC.remove(b'.').remove(b'-').remove(b'_');

fn image_mime(path: &str) -> Option<&'static str> {
    match path.rsplit_once('.')?.1.to_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

pub(super) fn bytes_response(bytes: Vec<u8>, headers: &[(header::HeaderName, String)]) -> Response {
    let mut resp = Response::new(Body::from(bytes));
    for (name, value) in headers {
        // Values are ASCII by construction (see attachment()).
        resp.headers_mut()
            .insert(name.clone(), value.parse().expect("ASCII header value"));
    }
    resp
}

/// RFC 6266 header: an ASCII fallback plus the real name percent-encoded (Thai file names).
pub(super) fn attachment(filename: &str) -> String {
    let ascii: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_graphic() && c != '"' && c != '\\' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let encoded = utf8_percent_encode(filename, FILENAME_ATTR);
    format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")
}

pub async fn get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let project = s.library.project(q.get("projectId").map(String::as_str))?;
    let Some(path) = q.get("path").filter(|p| !p.is_empty()).cloned() else {
        let tree = blocking(move || Ok(project.list_tree()?)).await?;
        return Ok(Json(json!({ "tree": tree })).into_response());
    };

    let read_path = path.clone();
    let bytes = blocking(move || project.read_bytes(&read_path)).await?;
    let mime = image_mime(&path);
    let is_pdf = path.ends_with(".pdf");

    if q.get("download").is_some_and(|v| v == "1") {
        let filename = path
            .rsplit('/')
            .next()
            .filter(|f| !f.is_empty())
            .unwrap_or(&path);
        let content_type = if is_pdf {
            "application/pdf"
        } else {
            mime.unwrap_or("application/octet-stream")
        };
        return Ok(bytes_response(
            bytes,
            &[
                (header::CONTENT_TYPE, content_type.into()),
                (header::CONTENT_DISPOSITION, attachment(filename)),
            ],
        ));
    }
    if is_pdf {
        return Ok(bytes_response(
            bytes,
            &[
                (header::CONTENT_TYPE, "application/pdf".into()),
                (header::ACCEPT_RANGES, "bytes".into()),
                (header::CACHE_CONTROL, "no-store".into()),
            ],
        ));
    }
    if let Some(mime) = mime {
        return Ok(bytes_response(
            bytes,
            &[
                (header::CONTENT_TYPE, mime.into()),
                (header::CACHE_CONTROL, "no-store".into()),
            ],
        ));
    }
    // Unlisted binary formats (docx, fonts, archives) must not be force-decoded as UTF-8.
    if is_binary_content(&bytes) {
        return Ok(Json(json!({ "unsupported": true })).into_response());
    }
    Ok(Json(json!({ "content": String::from_utf8_lossy(&bytes) })).into_response())
}

pub async fn post(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let action = str_field(&body, "action").unwrap_or_default();
    let (path, content, old_path, new_path) = (
        str_field(&body, "path"),
        str_field(&body, "content"),
        str_field(&body, "oldPath"),
        str_field(&body, "newPath"),
    );
    let is_dir = truthy(body.get("isDir"));

    blocking(move || {
        match action.as_str() {
            "create" => {
                let path = path.ok_or_else(|| ApiError::bad_request("Missing path"))?;
                if is_dir {
                    project.create_dir(&path)?
                } else {
                    project.write(&path, b"")?
                }
            }
            "save" => {
                let (Some(path), Some(content)) = (path, content) else {
                    return Err(ApiError::bad_request("Missing path or content"));
                };
                project.write(&path, content.as_bytes())?;
            }
            "move" => {
                let (Some(old), Some(new)) = (old_path, new_path) else {
                    return Err(ApiError::bad_request("Missing oldPath or newPath"));
                };
                project.move_path(&old, &new)?;
            }
            "copy" => {
                let (Some(src), Some(dest)) = (path, new_path) else {
                    return Err(ApiError::bad_request("Missing path or newPath"));
                };
                project.copy_path(&src, &dest)?;
            }
            "delete" => {
                let path = path.ok_or_else(|| ApiError::bad_request("Missing path"))?;
                project.delete_path(&path)?;
            }
            _ => return Err(ApiError::bad_request("Invalid action")),
        }
        project.touch();
        Ok(())
    })
    .await?;
    Ok(Json(json!({ "success": true })))
}

fn multipart_err(e: axum::extract::multipart::MultipartError) -> ApiError {
    ApiError::new(e.status(), e.body_text())
}

pub async fn upload(State(s): State<ApiState>, mut form: Multipart) -> ApiResult<Json<Value>> {
    let mut project_id = None;
    let mut target_dir = String::new();
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();

    // Field order is up to the client, so collect everything before resolving the project.
    while let Some(field) = form.next_field().await.map_err(multipart_err)? {
        match field.name().unwrap_or_default() {
            "projectId" => project_id = Some(field.text().await.map_err(multipart_err)?),
            "path" => target_dir = field.text().await.map_err(multipart_err)?,
            "files" => {
                let name = field.file_name().unwrap_or_default().to_owned();
                let bytes = field.bytes().await.map_err(multipart_err)?;
                files.push((name, bytes.to_vec()));
            }
            _ => {}
        }
    }

    let project = s.library.project(project_id.as_deref())?;
    if files.is_empty() {
        return Err(ApiError::bad_request("No files provided"));
    }
    if files.iter().any(|(name, _)| name.is_empty()) {
        return Err(ApiError::bad_request("Invalid file name"));
    }
    if let Some((name, _)) = files.iter().find(|(_, b)| b.len() > MAX_UPLOAD_BYTES) {
        return Err(ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            format!("\"{name}\" is too large"),
        ));
    }

    let saved = blocking(move || save_uploads(&project, &target_dir, files)).await?;
    Ok(Json(json!({ "success": true, "saved": saved })))
}

fn save_uploads(
    project: &Project,
    target_dir: &str,
    files: Vec<(String, Vec<u8>)>,
) -> ApiResult<Vec<String>> {
    let mut existing = HashSet::new();
    flatten_file_paths(&project.list_tree()?, &mut existing);
    let mut saved = Vec::new();
    for (name, bytes) in files {
        let dest = dedupe_upload_name(&existing, target_dir, &name);
        existing.insert(dest.clone());
        project.write(&dest, &bytes)?;
        saved.push(dest);
    }
    project.touch();
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_header_is_ascii_safe_and_keeps_the_real_name() {
        assert_eq!(
            attachment("report.pdf"),
            "attachment; filename=\"report.pdf\"; filename*=UTF-8''report.pdf"
        );
        let h = attachment("วิทยานิพนธ์ \"1\".pdf");
        assert!(h.is_ascii());
        assert!(h.contains("filename*=UTF-8''%E0%B8%A7"));
        assert!(!h.contains("\"1\""));
    }

    #[test]
    fn image_mime_follows_the_extension_only() {
        assert_eq!(image_mime("figs/A.PNG"), Some("image/png"));
        assert_eq!(image_mime("noext"), None);
        assert_eq!(image_mime("a.tex"), None);
    }
}
