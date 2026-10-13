//! The desktop-only AI routes: provider settings (bring-your-own-key, custom endpoints), the
//! streaming chat, and per-project chat history. There is no cloud counterpart: the cloud
//! editor talks to a hosted agent, so these never share a contract with `apps/editor/app/api`.
//!
//! API keys enter here from the Settings screen and are never returned: responses carry
//! `hasKey` and a four-character hint (see `ai::settings`).

use super::{ApiState, str_field};
use crate::{
    ai::{
        agent::{self, Conn, RunInput},
        protocol::{self, Msg},
        settings::{ProviderInput, draft_provider},
        threads,
        tools::ToolEnv,
    },
    error::{ApiError, ApiResult, blocking},
};
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{Query, State},
    http::header,
    response::Response,
};
use serde_json::{Value, json};
use std::{collections::HashMap, convert::Infallible, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::{StreamExt, wrappers::ReceiverStream};

/// Hard cap on messages accepted per chat request (the UI sends the whole conversation).
const MAX_CHAT_MESSAGES: usize = 2000;
const MODELS_TIMEOUT: Duration = Duration::from_secs(20);

// ---- settings --------------------------------------------------------------------------------

pub async fn settings_get(State(s): State<ApiState>) -> Json<Value> {
    Json(s.ai.snapshot().public())
}

/// Active provider/model and custom instructions.
pub async fn settings_post(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let ai = s.ai.clone();
    let settings = blocking(move || ai.set_preferences(&body)).await?;
    Ok(Json(settings.public()))
}

fn parse_input(body: Value) -> ApiResult<ProviderInput> {
    serde_json::from_value(body)
        .map_err(|_| ApiError::bad_request("That provider form isn't valid."))
}

pub async fn provider_save(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let input = parse_input(body)?;
    let ai = s.ai.clone();
    let (provider, settings) = blocking(move || ai.upsert_provider(input)).await?;
    Ok(Json(
        json!({ "provider": provider.public(), "settings": settings.public() }),
    ))
}

pub async fn provider_delete(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let id = str_field(&body, "id").ok_or_else(|| ApiError::bad_request("id is required"))?;
    let ai = s.ai.clone();
    let settings = blocking(move || ai.remove_provider(&id)).await?;
    Ok(Json(settings.public()))
}

/// Tries a provider that may not be saved yet (the form's current values, plus the stored key
/// when editing). `mode: "models"` lists the endpoint's models; `mode: "chat"` makes one real
/// round trip with `model`. Failures are a 200 with `ok: false`, since "the key is wrong" is an
/// answer, not a malfunction.
pub async fn provider_test(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let mode = str_field(&body, "mode").unwrap_or_else(|| "models".into());
    let model = str_field(&body, "model")
        .map(|m| m.trim().to_owned())
        .filter(|m| !m.is_empty());
    let input = parse_input(body)?;
    let stored = input
        .id
        .as_deref()
        .and_then(|id| s.ai.snapshot().provider(id).cloned());
    let provider = draft_provider(stored.as_ref(), &input)?;
    let http = s.http.client_for(&provider.base_url);

    if mode == "chat" {
        let Some(model) =
            model.or_else(|| Some(provider.default_model.clone()).filter(|m| !m.is_empty()))
        else {
            return Ok(Json(
                json!({ "ok": false, "error": "Enter a model name to test." }),
            ));
        };
        let conn = Conn {
            provider,
            model,
            system: String::new(),
            http,
        };
        let started = std::time::Instant::now();
        return Ok(Json(match agent::ping(&conn).await {
            Ok(sample) => {
                json!({ "ok": true, "sample": sample, "ms": started.elapsed().as_millis() as u64 })
            }
            Err(error) => json!({ "ok": false, "error": error }),
        }));
    }

    let mut req = http
        .get(protocol::models_url(&provider))
        .timeout(MODELS_TIMEOUT);
    for (name, value) in protocol::auth_headers(&provider) {
        req = req.header(name, value);
    }
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(Json(
                json!({ "ok": false, "error": agent::connection_error_message(&e, &provider) }),
            ));
        }
    };
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let mut error = agent::http_error_message(status, &text, &provider);
        if matches!(status.as_u16(), 404 | 405) {
            error.push_str(" Some endpoints don't list their models; you can still type a model name and use \"Test\".");
        }
        return Ok(Json(json!({ "ok": false, "error": error })));
    }
    Ok(Json(match parse_models(&text) {
        Some(models) => json!({ "ok": true, "models": models }),
        None => {
            json!({ "ok": false, "error": "The endpoint answered, but not with a list of models. Check that the base URL ends where the API starts (for OpenAI-style servers, usually /v1)." })
        }
    }))
}

/// `{data:[{id}]}` (OpenAI, Anthropic, OpenRouter, Ollama, LM Studio), `{models:[{name}]}`
/// (Gemini native) or a bare array. Gemini's "models/" prefix is dropped.
fn parse_models(text: &str) -> Option<Vec<String>> {
    let v: Value = serde_json::from_str(text).ok()?;
    let list = v
        .get("data")
        .or_else(|| v.get("models"))
        .unwrap_or(&v)
        .as_array()?;
    let mut ids: Vec<String> = list
        .iter()
        .filter_map(|m| {
            m.get("id")
                .or_else(|| m.get("name"))
                .or(Some(m))
                .and_then(Value::as_str)
                .map(|id| id.strip_prefix("models/").unwrap_or(id).to_owned())
        })
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids.truncate(500);
    Some(ids)
}

// ---- chat ------------------------------------------------------------------------------------

fn ndjson_response(rx: mpsc::Receiver<Bytes>) -> Response {
    let stream = ReceiverStream::new(rx).map(Ok::<_, Infallible>);
    let mut resp = Response::new(Body::from_stream(stream));
    let h = resp.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        "application/x-ndjson; charset=utf-8".parse().unwrap(),
    );
    h.insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
    resp
}

/// Streams one assistant turn as NDJSON (see `ai::agent`). Request: `{ projectId, messages,
/// openFile?, providerId?, model? }`. Setup problems (no provider, no project, a bad message
/// list) are ordinary JSON errors, so the UI can show them next to the composer.
pub async fn chat(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Response> {
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let messages = body
        .get("messages")
        .and_then(Value::as_array)
        .filter(|m| !m.is_empty() && m.len() <= MAX_CHAT_MESSAGES)
        .ok_or_else(|| ApiError::bad_request("messages is required"))?;
    let history = agent::history_from_client(messages);
    if !matches!(history.last(), Some(Msg::User(_))) {
        return Err(ApiError::bad_request("The last message must be from you."));
    }
    let settings = s.ai.snapshot();
    let (provider, model) = settings.resolve(
        body.get("providerId").and_then(Value::as_str),
        body.get("model").and_then(Value::as_str),
    )?;
    let open_file = body
        .get("openFile")
        .and_then(Value::as_str)
        .filter(|f| f.len() < 1024);
    let conn = Conn {
        system: agent::system_prompt(&settings.custom_instructions, open_file),
        http: s.http.client_for(&provider.base_url),
        provider,
        model,
    };
    let (tx, rx) = mpsc::channel(64);
    let env = ToolEnv::new(project, s.tex.clone());
    tokio::spawn(agent::run(RunInput { conn, history, env }, tx));
    Ok(ndjson_response(rx))
}

// ---- chat history ----------------------------------------------------------------------------

fn project_of(s: &ApiState, id: Option<&str>) -> ApiResult<crate::storage::Project> {
    s.library.project(id)
}

fn thread_id(q: &HashMap<String, String>) -> ApiResult<String> {
    q.get("threadId")
        .cloned()
        .filter(|t| !t.is_empty())
        .ok_or_else(|| ApiError::bad_request("Missing threadId"))
}

pub async fn threads_get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = project_of(&s, q.get("projectId").map(String::as_str))?;
    let index = blocking(move || Ok(threads::read_index(&project))).await?;
    Ok(Json(json!({ "index": index })))
}

pub async fn threads_put(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let project = project_of(&s, body.get("projectId").and_then(Value::as_str))?;
    let index = body.get("index").cloned().unwrap_or(Value::Null);
    // ponytail: whole-index overwrite, last writer wins (same as the cloud editor's store).
    blocking(move || threads::write_index(&project, &index)).await?;
    Ok(Json(json!({ "success": true })))
}

pub async fn thread_get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = project_of(&s, q.get("projectId").map(String::as_str))?;
    let id = thread_id(&q)?;
    let snapshot = blocking(move || threads::read_snapshot(&project, &id)).await?;
    Ok(Json(json!({ "snapshot": snapshot })))
}

pub async fn thread_put(
    State(s): State<ApiState>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let project = project_of(&s, body.get("projectId").and_then(Value::as_str))?;
    let id = str_field(&body, "threadId")
        .filter(|t| !t.is_empty())
        .ok_or_else(|| ApiError::bad_request("Missing threadId"))?;
    let messages = body.get("messages").cloned().unwrap_or(Value::Null);
    blocking(move || threads::write_snapshot(&project, &id, &messages)).await?;
    Ok(Json(json!({ "success": true })))
}

pub async fn thread_delete(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = project_of(&s, q.get("projectId").map(String::as_str))?;
    let id = thread_id(&q)?;
    blocking(move || threads::delete_snapshot(&project, &id)).await?;
    Ok(Json(json!({ "success": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_lists_parse_from_every_common_shape() {
        assert_eq!(
            parse_models(
                r#"{"object":"list","data":[{"id":"gpt-4.1"},{"id":"gpt-4.1"},{"id":"o4-mini"}]}"#
            ),
            Some(vec!["gpt-4.1".into(), "o4-mini".into()])
        );
        assert_eq!(
            parse_models(
                r#"{"models":[{"name":"models/gemini-2.5-pro"},{"name":"models/gemini-2.5-flash"}]}"#
            ),
            Some(vec!["gemini-2.5-flash".into(), "gemini-2.5-pro".into()])
        );
        assert_eq!(
            parse_models(r#"["a","b"]"#),
            Some(vec!["a".into(), "b".into()])
        );
        assert_eq!(parse_models(r#"{"data":[]}"#), Some(vec![]));
        assert_eq!(parse_models("<html>"), None);
        assert_eq!(parse_models(r#"{"error":"x"}"#), None);
    }
}
