//! Port of apps/editor/app/api/{compile,synctex}/route.ts. The cloud routes proxy to a
//! compiler service; here the handlers call `tex` directly.

use super::{ApiState, str_field};
use crate::{
    error::{ApiError, ApiResult},
    tex,
};
use axum::{Json, body::Body, extract::State, http::header, response::Response};
use serde_json::Value;
use std::convert::Infallible;
use tokio_stream::{StreamExt, wrappers::ReceiverStream};

fn require_path(body: &Value) -> ApiResult<String> {
    str_field(body, "path")
        .filter(|p| !p.is_empty())
        .ok_or_else(|| ApiError::bad_request("Path parameter is required"))
}

/// Streams Tectonic's log as `text/plain`. Success is the log ending in `[SUCCESS] <pdf>`,
/// not an HTTP status, because the UI reads the stream while it is still arriving.
pub async fn compile(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Response> {
    let path = require_path(&body)?;
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let rx = tex::start_compile(s.tex.clone(), &project, &path)?;
    Ok(stream_response(rx))
}

/// A live `text/plain` body fed from a compile's log channel.
pub(super) fn stream_response(rx: tokio::sync::mpsc::Receiver<axum::body::Bytes>) -> Response {
    let stream = ReceiverStream::new(rx).map(Ok::<_, Infallible>);
    let mut resp = Response::new(Body::from_stream(stream));
    let h = resp.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        "text/plain; charset=utf-8".parse().unwrap(),
    );
    h.insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
    resp
}

pub async fn synctex(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let path = require_path(&body)?;
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    Ok(Json(tex::synctex(&s.tex, &project, &path, &body).await?))
}
