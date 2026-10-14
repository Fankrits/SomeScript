//! The assistant's run loop. One call to [`run`] is one user turn: it asks the model for a
//! reply, streams the text to the UI as it arrives, runs the tools the model asked for against
//! the project, feeds the results back, and repeats until the model answers without tools.
//!
//! Everything the UI needs travels as NDJSON events on `tx` (one JSON object per line):
//!
//! ```text
//! {"type":"start","provider":"OpenAI","model":"gpt-4.1"}
//! {"type":"text","delta":"..."}            {"type":"reasoning","delta":"..."}
//! {"type":"tool-call","id","name","args","step"}  {"type":"tool-result","id","ok","result","output"}
//! {"type":"usage","input","output"}        {"type":"notice","message":"..."}
//! {"type":"error","message":"..."}         {"type":"done","reason":"stop"|"max-steps"|"stalled"|"error"}
//! ```
//!
//! The client going away (the stop button, closing the panel) closes `tx`; every await point
//! below races against that, so a cancelled turn stops the HTTP request and kills a running
//! compile instead of finishing in the background.

use super::{
    protocol::{self, Finish, Msg, StreamItem, ToolCall, ToolSpec},
    settings::Provider,
    sse::SseDecoder,
    tools::{ToolEnv, specs},
};
use axum::body::Bytes;
use reqwest::{StatusCode, header};
use serde_json::{Value, json};
use std::{pin::pin, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::StreamExt;

/// Tool-call rounds per user message. Generous for a multi-file edit, still a hard stop for a
/// model stuck in a loop.
pub const MAX_STEPS: usize = 25;
/// The same call failing the same way this many times in a row means the model is not going to
/// fix it by trying again, so the turn stops there instead of spending every step on it.
pub const MAX_REPEATED_FAILURES: usize = 3;
/// No bytes for this long means the connection is dead or the model hung.
const IDLE_TIMEOUT: Duration = Duration::from_secs(180);
const RETRY_DELAY: Duration = Duration::from_millis(1500);
/// History budget in characters (~100k tokens). Older tool output is dropped first.
const MAX_CONTEXT_CHARS: usize = 400_000;
const KEEP_RECENT_MESSAGES: usize = 8;
const ELIDED: &str = "[earlier tool output omitted to save space]";
const SYSTEM_PROMPT: &str = include_str!("instructions.md");

/// Everything needed to talk to one model: who, which model, with what standing instructions.
pub struct Conn {
    pub provider: Provider,
    pub model: String,
    pub system: String,
    pub http: reqwest::Client,
}

pub struct RunInput {
    pub conn: Conn,
    pub history: Vec<Msg>,
    pub env: ToolEnv,
}

pub fn system_prompt(custom_instructions: &str, open_file: Option<&str>) -> String {
    let mut s = SYSTEM_PROMPT.trim_end().to_owned();
    let custom = custom_instructions.trim();
    if !custom.is_empty() {
        s.push_str("\n\n---\n\n## The user's own instructions\n\n");
        s.push_str(custom);
    }
    if let Some(file) = open_file.filter(|f| !f.is_empty()) {
        s.push_str(&format!("\n\n[openFile: {file}]"));
    }
    s
}

/// Sends one event; `false` means the client is gone.
async fn emit(tx: &mpsc::Sender<Bytes>, event: Value) -> bool {
    let mut line = event.to_string();
    line.push('\n');
    tx.send(Bytes::from(line)).await.is_ok()
}

#[derive(Default)]
struct Step {
    text: String,
    calls: Vec<ToolCall>,
    finish: Option<Finish>,
}

enum StepError {
    /// The client disconnected.
    Cancelled,
    /// The provider refused or broke; the message is meant for the user.
    Failed {
        message: String,
        tools_rejected: bool,
    },
}

pub async fn run(mut input: RunInput, tx: mpsc::Sender<Bytes>) {
    if !emit(
        &tx,
        json!({ "type": "start", "provider": input.conn.provider.name, "model": input.conn.model }),
    )
    .await
    {
        return;
    }
    let mut tools: Vec<ToolSpec> = specs();
    let mut id_counter = 0usize;
    let id_prefix = random_prefix();
    let mut step_no = 0usize;
    // (tool, arguments) of the last failed call and how many times in a row it has failed.
    let mut last_failure: Option<(String, String)> = None;
    let mut repeated_failures = 0usize;

    let reason = loop {
        if step_no >= MAX_STEPS {
            emit(
                &tx,
                json!({ "type": "notice", "message": format!("Stopped after {MAX_STEPS} steps. Say \"continue\" to keep going.") }),
            )
            .await;
            break "max-steps";
        }
        step_no += 1;
        compact(&mut input.history, MAX_CONTEXT_CHARS);

        let step = match stream_step(&input.conn, &input.history, &tools, &tx).await {
            Ok(step) => step,
            Err(StepError::Cancelled) => return,
            Err(StepError::Failed {
                message,
                tools_rejected,
            }) => {
                if tools_rejected && !tools.is_empty() {
                    // Small local models often don't do tools. Chat is still useful.
                    tools.clear();
                    step_no -= 1;
                    if !emit(
                        &tx,
                        json!({ "type": "notice", "message": "This model doesn't support tools, so it can only chat: it can't read or change your files." }),
                    )
                    .await
                    {
                        return;
                    }
                    continue;
                }
                emit(&tx, json!({ "type": "error", "message": message })).await;
                break "error";
            }
        };

        if step.text.is_empty() && step.calls.is_empty() {
            emit(
                &tx,
                json!({ "type": "error", "message": format!("{} returned an empty reply. Check the model name in Settings.", input.conn.provider.name) }),
            )
            .await;
            break "error";
        }
        if step.calls.is_empty() {
            if step.finish == Some(Finish::Length) {
                emit(
                    &tx,
                    json!({ "type": "notice", "message": "The reply was cut off because the model hit its length limit. Say \"continue\" to get the rest." }),
                )
                .await;
            }
            input.history.push(Msg::Assistant {
                text: step.text,
                calls: vec![],
            });
            break "stop";
        }

        // Our own ids: providers differ in what they accept (length, characters, empty).
        let calls: Vec<ToolCall> = step
            .calls
            .into_iter()
            .map(|mut c| {
                id_counter += 1;
                c.id = format!("call_{id_prefix}{id_counter}");
                c
            })
            .collect();
        input.history.push(Msg::Assistant {
            text: step.text,
            calls: calls.clone(),
        });
        for call in calls {
            if !emit(
                &tx,
                json!({ "type": "tool-call", "id": call.id, "name": call.name, "args": call.args, "step": step_no }),
            )
            .await
            {
                return;
            }
            let outcome = tokio::select! {
                o = input.env.execute(&call) => o,
                _ = tx.closed() => return,
            };
            if !emit(
                &tx,
                json!({ "type": "tool-result", "id": call.id, "ok": outcome.ok, "result": outcome.ui, "output": outcome.model }),
            )
            .await
            {
                return;
            }
            if outcome.ok {
                last_failure = None;
                repeated_failures = 0;
            } else {
                let signature = (call.name.clone(), call.args.to_string());
                if last_failure.as_ref() == Some(&signature) {
                    repeated_failures += 1;
                } else {
                    last_failure = Some(signature);
                    repeated_failures = 1;
                }
            }
            input.history.push(Msg::Tool {
                call_id: call.id,
                name: call.name,
                content: outcome.model,
            });
        }
        if repeated_failures >= MAX_REPEATED_FAILURES {
            let tool = last_failure.map(|(name, _)| name).unwrap_or_default();
            emit(
                &tx,
                json!({ "type": "notice", "message": format!(
                    "The model called {tool} with the same arguments {MAX_REPEATED_FAILURES} times and got an error each time, so the assistant stopped. This model may not handle tool calls well. Try a different model in Settings."
                ) }),
            )
            .await;
            break "stalled";
        }
    };
    emit(&tx, json!({ "type": "done", "reason": reason })).await;
}

fn random_prefix() -> String {
    let mut b = [0u8; 3];
    getrandom::fill(&mut b).expect("OS random source unavailable");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

async fn stream_step(
    conn: &Conn,
    history: &[Msg],
    tools: &[ToolSpec],
    tx: &mpsc::Sender<Bytes>,
) -> Result<Step, StepError> {
    let body = protocol::build_body(&conn.provider, &conn.model, &conn.system, history, tools);
    let resp = send(conn, &body, tx).await?;
    let mut decoder = protocol::decoder(conn.provider.kind);
    let mut sse = SseDecoder::default();
    let mut step = Step::default();
    let (mut usage_in, mut usage_out) = (0u64, 0u64);

    let mut stream = pin!(resp.bytes_stream());
    let mut apply = |items: Vec<StreamItem>, step: &mut Step| -> Vec<Value> {
        let mut events = Vec::new();
        for item in items {
            match item {
                StreamItem::Text(t) => {
                    events.push(json!({ "type": "text", "delta": t }));
                    step.text.push_str(&t);
                }
                StreamItem::Reasoning(t) => events.push(json!({ "type": "reasoning", "delta": t })),
                StreamItem::Usage { input, output } => {
                    usage_in = input;
                    usage_out = output;
                }
                StreamItem::ToolCall(c) => step.calls.push(c),
                StreamItem::Finish(f) => step.finish = Some(f),
            }
        }
        events
    };
    loop {
        let next = tokio::select! {
            n = tokio::time::timeout(IDLE_TIMEOUT, stream.next()) => n,
            _ = tx.closed() => return Err(StepError::Cancelled),
        };
        let chunk = match next {
            Err(_) => {
                return Err(failed(format!(
                    "{} stopped responding. Try again, or pick a different model.",
                    conn.provider.name
                )));
            }
            Ok(None) => break,
            Ok(Some(Err(e))) => {
                return Err(failed(format!(
                    "The connection to {} was interrupted ({}).",
                    conn.provider.name,
                    short_error(&e)
                )));
            }
            Ok(Some(Ok(bytes))) => bytes,
        };
        for event in sse.push(&chunk) {
            let items = decoder.feed(&event).map_err(|message| {
                failed(format!(
                    "{}: {}",
                    conn.provider.name,
                    redact(&conn.provider, &message)
                ))
            })?;
            for e in apply(items, &mut step) {
                if !emit(tx, e).await {
                    return Err(StepError::Cancelled);
                }
            }
        }
    }
    for event in sse.finish() {
        let items = decoder.feed(&event).map_err(|message| {
            failed(format!(
                "{}: {}",
                conn.provider.name,
                redact(&conn.provider, &message)
            ))
        })?;
        for e in apply(items, &mut step) {
            if !emit(tx, e).await {
                return Err(StepError::Cancelled);
            }
        }
    }
    for e in apply(decoder.finish(), &mut step) {
        if !emit(tx, e).await {
            return Err(StepError::Cancelled);
        }
    }
    if (usage_in > 0 || usage_out > 0)
        && !emit(
            tx,
            json!({ "type": "usage", "input": usage_in, "output": usage_out }),
        )
        .await
    {
        return Err(StepError::Cancelled);
    }
    Ok(step)
}

/// One real round trip with the chosen model (the same request path as a chat, minus tools):
/// proves the endpoint, key and model name work together. Returns a sample of the reply.
pub async fn ping(conn: &Conn) -> Result<String, String> {
    let (tx, mut rx) = mpsc::channel::<Bytes>(64);
    // Keep the receiver alive and empty, so the step doesn't think the client left.
    let drain = tokio::spawn(async move { while rx.recv().await.is_some() {} });
    let probe = Conn {
        provider: conn.provider.clone(),
        model: conn.model.clone(),
        system: "Reply with the single word: ok".into(),
        http: conn.http.clone(),
    };
    let history = [Msg::User("Say ok.".into())];
    let result = tokio::time::timeout(
        Duration::from_secs(45),
        stream_step(&probe, &history, &[], &tx),
    )
    .await;
    drop(tx);
    let _ = drain.await;
    match result {
        Err(_) => Err(format!("{} didn't answer in time.", conn.provider.name)),
        Ok(Err(StepError::Cancelled)) => Err("Cancelled.".into()),
        Ok(Err(StepError::Failed { message, .. })) => Err(message),
        Ok(Ok(step)) if step.text.trim().is_empty() => Err(format!(
            "{} answered with nothing. Check the model name.",
            conn.provider.name
        )),
        Ok(Ok(step)) => Ok(step.text.trim().chars().take(80).collect()),
    }
}

fn failed(message: String) -> StepError {
    StepError::Failed {
        message,
        tools_rejected: false,
    }
}

fn short_error(e: &reqwest::Error) -> String {
    // reqwest's Display includes the URL; the cause chain has the useful part.
    let mut cause: &dyn std::error::Error = e;
    while let Some(next) = cause.source() {
        cause = next;
    }
    let text = cause.to_string();
    text.chars().take(160).collect()
}

/// Sends the request, retrying once on a dropped connection or a transient 5xx/429, and turns
/// failure statuses into messages a person can act on.
async fn send(
    conn: &Conn,
    body: &Value,
    tx: &mpsc::Sender<Bytes>,
) -> Result<reqwest::Response, StepError> {
    let url = protocol::chat_url(&conn.provider);
    for attempt in 0..2 {
        let mut req = conn
            .http
            .post(&url)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream");
        for (name, value) in protocol::auth_headers(&conn.provider) {
            req = req.header(name, value);
        }
        let sent = tokio::select! {
            r = req.json(body).send() => r,
            _ = tx.closed() => return Err(StepError::Cancelled),
        };
        let first_attempt = attempt == 0;
        match sent {
            Ok(resp) if resp.status().is_success() => return Ok(resp),
            Ok(resp) => {
                let status = resp.status();
                let text = tokio::select! {
                    t = resp.text() => t.unwrap_or_default(),
                    _ = tx.closed() => return Err(StepError::Cancelled),
                };
                if first_attempt && is_transient(status) {
                    tokio::time::sleep(RETRY_DELAY).await;
                    continue;
                }
                return Err(StepError::Failed {
                    message: http_error_message(status, &text, &conn.provider),
                    tools_rejected: status == StatusCode::BAD_REQUEST && mentions_tools(&text),
                });
            }
            Err(e) => {
                if first_attempt && (e.is_connect() || e.is_timeout()) {
                    tokio::time::sleep(RETRY_DELAY).await;
                    continue;
                }
                return Err(failed(connection_error_message(&e, &conn.provider)));
            }
        }
    }
    unreachable!("the loop returns on its second attempt")
}

fn is_transient(status: StatusCode) -> bool {
    matches!(status.as_u16(), 408 | 429 | 500 | 502 | 503 | 504 | 529)
}

fn mentions_tools(body: &str) -> bool {
    let b = body.to_lowercase();
    b.contains("tool") || b.contains("function")
}

pub fn connection_error_message(e: &reqwest::Error, provider: &Provider) -> String {
    let detail = short_error(e);
    if e.is_connect() {
        format!(
            "Couldn't reach {} at {} ({detail}). Check the base URL and your connection{}.",
            provider.name,
            provider.base_url,
            if provider.base_url.contains("localhost") || provider.base_url.contains("127.0.0.1") {
                ", and that the local server is running"
            } else {
                ""
            }
        )
    } else if e.is_timeout() {
        format!("{} took too long to answer. Try again.", provider.name)
    } else if e.is_redirect() || e.status().is_some_and(|s| s.is_redirection()) {
        format!(
            "{} redirected the request. Update the base URL in Settings to the final address.",
            provider.name
        )
    } else {
        format!("Couldn't talk to {} ({detail}).", provider.name)
    }
}

/// The provider's own words, if it sent any: `{"error":{"message":...}}` or `{"message":...}`.
fn provider_detail(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    let msg = v
        .pointer("/error/message")
        .or_else(|| v.get("message"))
        .or_else(|| v.get("error").filter(|e| e.is_string()))
        .and_then(Value::as_str)?;
    Some(msg.chars().take(500).collect())
}

/// Some providers quote the offending key back in their error; never pass that on.
pub fn redact(provider: &Provider, text: &str) -> String {
    if provider.api_key.len() >= 8 {
        text.replace(&provider.api_key, "[your key]")
    } else {
        text.to_owned()
    }
}

pub fn http_error_message(status: StatusCode, body: &str, provider: &Provider) -> String {
    let detail = provider_detail(body)
        .or_else(|| {
            let t = body.trim();
            (!t.is_empty() && !t.starts_with('<')).then(|| t.chars().take(300).collect())
        })
        .map(|d: String| redact(provider, &d));
    let name = &provider.name;
    let lead = match status.as_u16() {
        401 => format!("{name} rejected the API key (401). Check it in Settings."),
        403 => {
            format!("{name} refused the request (403). The key may not have access to this model.")
        }
        404 => format!(
            "{name} doesn't have that endpoint or model (404). Check the base URL and the model name in Settings."
        ),
        413 => format!("The conversation is too large for {name} (413). Start a new chat."),
        429 => format!(
            "{name} says you're out of quota or sending too fast (429). Wait a moment, or check your plan."
        ),
        500..=599 => format!(
            "{name} had a problem on its side ({}). Try again shortly.",
            status.as_u16()
        ),
        code => format!("{name} returned an error ({code})."),
    };
    match detail {
        Some(d) if !lead.contains(&d) => format!("{lead} It said: {d}"),
        _ => lead,
    }
}

// ---- history ---------------------------------------------------------------------------------

/// Rebuilds the model-facing history from the messages the UI keeps (and persists).
///
/// UI shapes: `{role:"user", text, attachments?:[{name,text}]}` and
/// `{role:"assistant", parts:[{type:"text",text} | {type:"reasoning",...} |
/// {type:"tool",id,name,args,output?}]}`. An assistant message is several model steps flattened
/// (text, tool calls, text, ...), so a text part after tool parts starts a new step. A tool call
/// with no `output` (the run was stopped) gets a stand-in result, because providers reject a
/// tool call that is never answered.
pub fn history_from_client(messages: &[Value]) -> Vec<Msg> {
    let mut out = Vec::new();
    for m in messages {
        match m.get("role").and_then(Value::as_str) {
            Some("user") => {
                let mut text = m
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                for a in m
                    .get("attachments")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let name = a
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("attachment");
                    let body = a.get("text").and_then(Value::as_str).unwrap_or("");
                    text.push_str(&format!(
                        "\n\n<attachment name=\"{name}\">\n{body}\n</attachment>"
                    ));
                }
                if !text.trim().is_empty() {
                    out.push(Msg::User(text));
                }
            }
            Some("assistant") => push_assistant(&mut out, m),
            _ => {}
        }
    }
    out
}

fn push_assistant(out: &mut Vec<Msg>, m: &Value) {
    let mut text = String::new();
    let mut calls: Vec<ToolCall> = Vec::new();
    let mut results: Vec<Msg> = Vec::new();
    // Which model step the buffered calls belong to; `step` on a tool part is what the server
    // emitted, so two calls from different steps (read, then edit after seeing the result) are not
    // replayed as one parallel batch. Messages saved without it keep the older, merged reading.
    let mut calls_step: Option<u64> = None;
    let flush = |out: &mut Vec<Msg>,
                 text: &mut String,
                 calls: &mut Vec<ToolCall>,
                 results: &mut Vec<Msg>| {
        if text.is_empty() && calls.is_empty() {
            return;
        }
        out.push(Msg::Assistant {
            text: std::mem::take(text),
            calls: std::mem::take(calls),
        });
        out.append(results);
    };
    for part in m
        .get("parts")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        match part.get("type").and_then(Value::as_str) {
            Some("text") => {
                if !calls.is_empty() {
                    flush(out, &mut text, &mut calls, &mut results);
                }
                text.push_str(part.get("text").and_then(Value::as_str).unwrap_or(""));
            }
            Some("tool") => {
                let id = part
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                let name = part
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                if id.is_empty() || name.is_empty() {
                    continue;
                }
                let step = part.get("step").and_then(Value::as_u64);
                if !calls.is_empty() && step != calls_step {
                    flush(out, &mut text, &mut calls, &mut results);
                }
                calls_step = step;
                let output = part.get("output").and_then(Value::as_str).map_or_else(
                    || "The tool did not finish (the run was stopped).".to_owned(),
                    str::to_owned,
                );
                calls.push(ToolCall {
                    id: id.clone(),
                    name: name.clone(),
                    args: part
                        .get("args")
                        .cloned()
                        .filter(Value::is_object)
                        .unwrap_or_else(|| json!({})),
                    args_error: None,
                });
                results.push(Msg::Tool {
                    call_id: id,
                    name,
                    content: output,
                });
            }
            _ => {} // reasoning and anything newer is for the screen only
        }
    }
    flush(out, &mut text, &mut calls, &mut results);
}

fn msg_chars(m: &Msg) -> usize {
    match m {
        Msg::User(t) => t.chars().count(),
        Msg::Assistant { text, calls } => {
            text.chars().count()
                + calls
                    .iter()
                    .map(|c| c.args.to_string().len() + c.name.len())
                    .sum::<usize>()
        }
        Msg::Tool { content, .. } => content.chars().count(),
    }
}

/// Keeps the request under `budget` characters. First the oldest tool outputs are replaced by a
/// stub (they are the bulk: whole files and compile logs), then whole old turns are dropped.
/// The most recent messages are never touched, and the history always starts with a user message.
pub fn compact(history: &mut Vec<Msg>, budget: usize) {
    let total = |h: &[Msg]| h.iter().map(msg_chars).sum::<usize>();
    if total(history) <= budget {
        return;
    }
    let protected_from = history.len().saturating_sub(KEEP_RECENT_MESSAGES);
    for m in history.iter_mut().take(protected_from) {
        if let Msg::Tool { content, .. } = m
            && content != ELIDED
        {
            *content = ELIDED.to_owned();
        }
    }
    // Still too big (a very long chat, or huge user pastes): drop the oldest complete turns.
    while total(history) > budget && history.len() > KEEP_RECENT_MESSAGES {
        let next_user = history
            .iter()
            .enumerate()
            .skip(1)
            .find(|(_, m)| matches!(m, Msg::User(_)))
            .map(|(i, _)| i);
        match next_user {
            Some(i) if history.len() - i >= 1 => {
                history.drain(..i);
            }
            _ => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{
        settings::ProviderKind,
        testing::{Reply, spawn_mock},
    };
    use crate::{storage::Project, tex::TexTools};
    use std::sync::Arc;

    fn user(t: &str) -> Msg {
        Msg::User(t.into())
    }

    // ---- history ----

    #[test]
    fn client_history_becomes_provider_history_with_attachments_and_step_boundaries() {
        let messages = vec![
            json!({ "role": "user", "text": "fix this", "attachments": [{ "name": "main.tex:3-4", "text": "\\bad" }] }),
            json!({ "role": "assistant", "parts": [
                { "type": "reasoning", "text": "thinking..." },
                { "type": "text", "text": "Let me look." },
                { "type": "tool", "id": "c1", "name": "read_file", "args": { "path": "main.tex" }, "output": "1→x", "result": { "ok": true } },
                { "type": "tool", "id": "c2", "name": "grep", "args": { "query": "x" }, "output": "no matches" },
                { "type": "text", "text": "Found it." },
                { "type": "tool", "id": "c3", "name": "edit_file", "args": {}, "output": "Edited" },
                { "type": "text", "text": "Fixed." },
            ]}),
            json!({ "role": "user", "text": "thanks" }),
        ];
        let h = history_from_client(&messages);
        assert_eq!(h.len(), 8, "{h:#?}");
        assert_eq!(
            h[0],
            Msg::User(
                "fix this\n\n<attachment name=\"main.tex:3-4\">\n\\bad\n</attachment>".into()
            )
        );
        let Msg::Assistant { text, calls } = &h[1] else {
            panic!()
        };
        assert_eq!((text.as_str(), calls.len()), ("Let me look.", 2));
        assert!(matches!(&h[2], Msg::Tool { call_id, .. } if call_id == "c1"));
        assert!(matches!(&h[3], Msg::Tool { call_id, .. } if call_id == "c2"));
        let Msg::Assistant { text, calls } = &h[4] else {
            panic!()
        };
        assert_eq!((text.as_str(), calls[0].id.as_str()), ("Found it.", "c3"));
        assert!(matches!(&h[5], Msg::Tool { content, .. } if content == "Edited"));
        assert_eq!(
            h[6],
            Msg::Assistant {
                text: "Fixed.".into(),
                calls: vec![]
            }
        );
        assert_eq!(h[7], user("thanks"));
    }

    #[test]
    fn an_interrupted_tool_call_still_gets_a_result_and_junk_is_ignored() {
        let h = history_from_client(&[
            json!({ "role": "user", "text": "go" }),
            json!({ "role": "assistant", "parts": [
                { "type": "tool", "id": "c1", "name": "compile_project", "args": "not an object" },
                { "type": "tool", "name": "x" },
            ]}),
            json!({ "role": "system", "text": "ignored" }),
            json!({ "role": "user", "text": "   " }),
        ]);
        assert_eq!(h.len(), 3);
        let Msg::Assistant { calls, .. } = &h[1] else {
            panic!()
        };
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].args, json!({}));
        assert!(matches!(&h[2], Msg::Tool { content, .. } if content.contains("did not finish")));
    }

    #[test]
    fn tool_calls_from_different_steps_are_replayed_as_separate_steps() {
        let h = history_from_client(&[
            json!({ "role": "user", "text": "go" }),
            json!({ "role": "assistant", "parts": [
                { "type": "tool", "id": "a", "name": "read_file", "args": {}, "output": "x", "step": 1 },
                { "type": "tool", "id": "b", "name": "read_file", "args": {}, "output": "y", "step": 1 },
                { "type": "tool", "id": "c", "name": "edit_file", "args": {}, "output": "z", "step": 2 },
                { "type": "text", "text": "done" },
            ]}),
        ]);
        let shape: Vec<String> = h
            .iter()
            .map(|m| match m {
                Msg::User(_) => "user".to_owned(),
                Msg::Assistant { calls, text } => {
                    format!("assistant({} calls, {:?})", calls.len(), text)
                }
                Msg::Tool { call_id, .. } => format!("tool({call_id})"),
            })
            .collect();
        assert_eq!(
            shape,
            [
                "user",
                "assistant(2 calls, \"\")",
                "tool(a)",
                "tool(b)",
                "assistant(1 calls, \"\")",
                "tool(c)",
                "assistant(0 calls, \"done\")",
            ]
        );
    }

    #[test]
    fn compaction_drops_old_tool_output_first_then_old_turns() {
        let big = "x".repeat(10_000);
        let mut h = vec![user("first")];
        for i in 0..6 {
            h.push(Msg::Assistant {
                text: String::new(),
                calls: vec![ToolCall {
                    id: format!("c{i}"),
                    name: "read_file".into(),
                    args: json!({}),
                    args_error: None,
                }],
            });
            h.push(Msg::Tool {
                call_id: format!("c{i}"),
                name: "read_file".into(),
                content: big.clone(),
            });
        }
        h.push(user("second"));
        h.push(Msg::Assistant {
            text: "answer".into(),
            calls: vec![],
        });
        let last = h.last().cloned().unwrap();

        let mut elided = h.clone();
        compact(&mut elided, 40_000);
        let kept_full = elided
            .iter()
            .filter(|m| matches!(m, Msg::Tool { content, .. } if content.len() == 10_000))
            .count();
        let stubs = elided
            .iter()
            .filter(|m| matches!(m, Msg::Tool { content, .. } if content == ELIDED))
            .count();
        assert!(
            stubs > 0 && kept_full > 0,
            "old output is stubbed, the recent output survives"
        );
        assert_eq!(
            elided.len(),
            h.len(),
            "no messages dropped while stubbing is enough"
        );
        assert_eq!(elided.last(), Some(&last));

        let mut tiny = h.clone();
        compact(&mut tiny, 100);
        assert_eq!(tiny.last(), Some(&last));
        assert!(
            matches!(tiny[0], Msg::User(_)),
            "history must start with a user message"
        );
        assert!(tiny.len() < h.len());

        let mut small = vec![user("hi")];
        compact(&mut small, 10);
        assert_eq!(
            small,
            vec![user("hi")],
            "the latest message is never dropped"
        );
    }

    #[test]
    fn the_system_prompt_carries_custom_instructions_and_the_open_file() {
        let base = system_prompt("", None);
        assert!(
            base.contains("edit_file"),
            "tool names in the prompt match the tools"
        );
        for spec in specs() {
            assert!(
                base.contains(&spec.name),
                "prompt never mentions {}",
                spec.name
            );
        }
        assert!(
            !base.ends_with(']'),
            "no open-file marker without an open file"
        );
        let full = system_prompt("  Always use biblatex.  ", Some("chapters/a.tex"));
        assert!(full.contains("Always use biblatex."));
        assert!(full.ends_with("[openFile: chapters/a.tex]"));
    }

    #[test]
    fn http_errors_become_actionable_messages_without_leaking_markup() {
        let p = Provider {
            name: "OpenAI".into(),
            ..Default::default()
        };
        let m = http_error_message(
            StatusCode::UNAUTHORIZED,
            r#"{"error":{"message":"Incorrect API key provided: sk-abc***"}}"#,
            &p,
        );
        assert!(
            m.starts_with("OpenAI rejected the API key (401). Check it in Settings."),
            "{m}"
        );
        assert!(m.contains("Incorrect API key"), "{m}");
        let m = http_error_message(
            StatusCode::NOT_FOUND,
            r#"{"error":{"message":"The model `gpt-9` does not exist"}}"#,
            &p,
        );
        assert!(m.contains("model name") && m.contains("gpt-9"), "{m}");
        let m = http_error_message(
            StatusCode::BAD_GATEWAY,
            "<html><body>Bad gateway</body></html>",
            &p,
        );
        assert!(!m.contains('<'), "{m}");
        let m = http_error_message(StatusCode::TOO_MANY_REQUESTS, "", &p);
        assert!(m.contains("429"));
    }

    // ---- the loop, against a scripted provider ----

    fn openai_text(parts: &[&str]) -> String {
        let mut s = String::new();
        for p in parts {
            s.push_str(&format!(
                "data: {}\n\n",
                json!({ "choices": [{ "delta": { "content": p } }] })
            ));
        }
        s.push_str(
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
        );
        s
    }

    fn openai_tool(id: &str, name: &str, args: &str) -> String {
        let first = json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "id": id, "type": "function", "function": { "name": name, "arguments": "" } }] } }] });
        let rest = json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "function": { "arguments": args } }] } }] });
        format!(
            "data: {first}\n\ndata: {rest}\n\ndata: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"tool_calls\"}}]}}\n\ndata: [DONE]\n\n"
        )
    }

    struct Setup {
        _dir: tempfile::TempDir,
        project: Project,
    }

    fn setup() -> Setup {
        crate::ai::init_tls();
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let project = Project::open(root).unwrap();
        project
            .write(
                "main.tex",
                b"\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n",
            )
            .unwrap();
        Setup { _dir: dir, project }
    }

    fn input(setup: &Setup, kind: ProviderKind, base_url: &str, history: Vec<Msg>) -> RunInput {
        RunInput {
            conn: Conn {
                provider: Provider {
                    id: "p".into(),
                    name: "Mock".into(),
                    kind,
                    base_url: base_url.into(),
                    api_key: "sk-test-key-1234".into(),
                    ..Default::default()
                },
                model: "mock-1".into(),
                system: "SYS".into(),
                http: crate::ai::AiHttp::new().client_for(base_url).unwrap(),
            },
            history,
            env: ToolEnv::new(
                setup.project.clone(),
                Arc::new(TexTools::new("never".into(), "never".into())),
            ),
        }
    }

    async fn collect(input: RunInput) -> Vec<Value> {
        let (tx, mut rx) = mpsc::channel(256);
        let task = tokio::spawn(run(input, tx));
        let mut events = Vec::new();
        while let Some(chunk) = rx.recv().await {
            for line in String::from_utf8(chunk.to_vec()).unwrap().lines() {
                events.push(serde_json::from_str(line).unwrap());
            }
        }
        task.await.unwrap();
        events
    }

    fn types(events: &[Value]) -> Vec<&str> {
        events.iter().map(|e| e["type"].as_str().unwrap()).collect()
    }

    #[tokio::test]
    async fn a_plain_answer_streams_text_and_finishes() {
        let s = setup();
        let mock = spawn_mock(vec![Reply::Sse(openai_text(&["Hel", "lo!"]))]).await;
        let events = collect(input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")])).await;
        assert_eq!(types(&events), ["start", "text", "text", "done"]);
        assert_eq!(events[0]["provider"], "Mock");
        assert_eq!(events[1]["delta"], "Hel");
        assert_eq!(events[3]["reason"], "stop");

        let reqs = mock.requests();
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].path, "/chat/completions");
        assert_eq!(reqs[0].headers["authorization"], "Bearer sk-test-key-1234");
        assert_eq!(reqs[0].body["model"], "mock-1");
        assert_eq!(reqs[0].body["messages"][0]["content"], "SYS");
        assert_eq!(reqs[0].body["messages"][1]["content"], "hi");
        assert_eq!(
            reqs[0].body["tools"].as_array().unwrap().len(),
            specs().len()
        );
    }

    #[tokio::test]
    async fn tool_calls_run_against_the_project_and_their_results_go_back_to_the_model() {
        let s = setup();
        let mock = spawn_mock(vec![
            Reply::Sse(openai_tool(
                "provider-id-1",
                "edit_file",
                r#"{"path":"main.tex","oldText":"Hello","newText":"Hello, world"}"#,
            )),
            Reply::Sse(openai_text(&["Done: I changed the greeting."])),
        ])
        .await;
        let events = collect(input(
            &s,
            ProviderKind::Openai,
            &mock.url,
            vec![user("change the greeting")],
        ))
        .await;

        assert_eq!(
            types(&events),
            ["start", "tool-call", "tool-result", "text", "done"]
        );
        let call_id = events[1]["id"].as_str().unwrap().to_owned();
        assert!(
            call_id.starts_with("call_"),
            "we mint our own ids, got {call_id}"
        );
        assert_eq!(events[1]["name"], "edit_file");
        assert_eq!(events[1]["args"]["newText"], "Hello, world");
        assert_eq!(events[2]["id"], call_id.as_str());
        assert_eq!(events[2]["ok"], true);
        assert!(
            events[2]["result"]["after"]
                .as_str()
                .unwrap()
                .contains("Hello, world")
        );
        assert_eq!(
            events[2]["output"],
            "Edited main.tex — replaced 1 block at line 3."
        );
        assert!(
            s.project
                .read_text("main.tex")
                .unwrap()
                .contains("Hello, world")
        );

        let second = &mock.requests()[1].body;
        let m = second["messages"].as_array().unwrap();
        assert_eq!(m[2]["role"], "assistant");
        assert_eq!(m[2]["tool_calls"][0]["id"], call_id.as_str());
        assert_eq!(
            m[3],
            json!({ "role": "tool", "tool_call_id": call_id, "content": "Edited main.tex — replaced 1 block at line 3." })
        );
    }

    #[tokio::test]
    async fn a_failing_tool_is_reported_to_the_model_which_can_recover() {
        let s = setup();
        let mock = spawn_mock(vec![
            Reply::Sse(openai_tool("a", "read_file", r#"{"path":"missing.tex"}"#)),
            Reply::Sse(openai_text(&["That file doesn't exist."])),
        ])
        .await;
        let events = collect(input(
            &s,
            ProviderKind::Openai,
            &mock.url,
            vec![user("read missing.tex")],
        ))
        .await;
        assert_eq!(events[2]["ok"], false);
        assert_eq!(events[2]["output"], "Error: missing.tex does not exist.");
        assert_eq!(events.last().unwrap()["reason"], "stop");
        let m = &mock.requests()[1].body["messages"];
        assert_eq!(m[3]["content"], "Error: missing.tex does not exist.");
    }

    #[tokio::test]
    async fn the_anthropic_protocol_works_end_to_end() {
        let s = setup();
        let tool_stream = concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":10}}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"read_file\",\"input\":{}}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"path\\\":\\\"main.tex\\\"}\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":20}}\n\n",
        );
        let text_stream = concat!(
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"It says Hello.\"}}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":5}}\n\n",
        );
        let mock = spawn_mock(vec![
            Reply::Sse(tool_stream.into()),
            Reply::Sse(text_stream.into()),
        ])
        .await;
        let events = collect(input(
            &s,
            ProviderKind::Anthropic,
            &mock.url,
            vec![user("what does main.tex say?")],
        ))
        .await;
        assert_eq!(
            types(&events),
            [
                "start",
                "usage",
                "tool-call",
                "tool-result",
                "text",
                "usage",
                "done"
            ]
        );
        assert_eq!(events[3]["ok"], true);

        let reqs = mock.requests();
        assert_eq!(reqs[0].path, "/v1/messages");
        assert_eq!(reqs[0].headers["x-api-key"], "sk-test-key-1234");
        assert_eq!(
            reqs[0].headers["anthropic-version"],
            protocol::ANTHROPIC_VERSION
        );
        assert_eq!(reqs[0].body["system"], "SYS");
        let followup = reqs[1].body["messages"].as_array().unwrap().clone();
        assert_eq!(followup[1]["content"][0]["type"], "tool_use");
        assert_eq!(followup[2]["role"], "user");
        assert_eq!(followup[2]["content"][0]["type"], "tool_result");
        assert!(
            followup[2]["content"][0]["content"]
                .as_str()
                .unwrap()
                .contains("Hello")
        );
    }

    #[tokio::test]
    async fn provider_errors_are_explained_and_never_echo_the_key() {
        let s = setup();
        let mock = spawn_mock(vec![Reply::Json(
            StatusCode::UNAUTHORIZED,
            json!({ "error": { "message": "Incorrect API key provided" } }),
        )])
        .await;
        let events = collect(input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")])).await;
        assert_eq!(types(&events), ["start", "error", "done"]);
        let message = events[1]["message"].as_str().unwrap();
        assert!(message.contains("rejected the API key (401)"), "{message}");
        assert!(!message.contains("sk-test-key"), "{message}");
        assert_eq!(events[2]["reason"], "error");
        assert_eq!(mock.requests().len(), 1, "401 is not retried");
    }

    #[tokio::test]
    async fn a_transient_failure_is_retried_once() {
        let s = setup();
        let mock = spawn_mock(vec![
            Reply::Json(
                StatusCode::SERVICE_UNAVAILABLE,
                json!({ "error": { "message": "overloaded" } }),
            ),
            Reply::Sse(openai_text(&["back"])),
        ])
        .await;
        let events = collect(input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")])).await;
        assert_eq!(types(&events), ["start", "text", "done"]);
        assert_eq!(mock.requests().len(), 2);
    }

    #[tokio::test]
    async fn a_model_without_tool_support_falls_back_to_plain_chat() {
        let s = setup();
        let mock = spawn_mock(vec![
            Reply::Json(StatusCode::BAD_REQUEST, json!({ "error": { "message": "registry.ollama.ai/library/tinyllama does not support tools" } })),
            Reply::Sse(openai_text(&["I can chat."])),
        ])
        .await;
        let events = collect(input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")])).await;
        assert_eq!(types(&events), ["start", "notice", "text", "done"]);
        assert!(
            events[1]["message"]
                .as_str()
                .unwrap()
                .contains("doesn't support tools")
        );
        let reqs = mock.requests();
        assert!(reqs[0].body.get("tools").is_some());
        assert!(reqs[1].body.get("tools").is_none());
    }

    #[tokio::test]
    async fn a_stream_error_and_an_empty_reply_are_reported() {
        let s = setup();
        let mock = spawn_mock(vec![Reply::Sse(
            "data: {\"error\":{\"message\":\"context_length_exceeded\"}}\n\n".into(),
        )])
        .await;
        let events = collect(input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")])).await;
        assert_eq!(types(&events), ["start", "error", "done"]);
        assert!(
            events[1]["message"]
                .as_str()
                .unwrap()
                .contains("context_length_exceeded")
        );

        let mock = spawn_mock(vec![Reply::Sse("data: [DONE]\n\n".into())]).await;
        let events = collect(input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")])).await;
        assert!(
            events[1]["message"]
                .as_str()
                .unwrap()
                .contains("empty reply")
        );
    }

    #[tokio::test]
    async fn a_model_that_never_stops_calling_tools_is_cut_off() {
        let s = setup();
        let replies = (0..MAX_STEPS + 2)
            .map(|_| Reply::Sse(openai_tool("x", "list_files", "{}")))
            .collect();
        let mock = spawn_mock(replies).await;
        let events = collect(input(
            &s,
            ProviderKind::Openai,
            &mock.url,
            vec![user("loop")],
        ))
        .await;
        let last = events.last().unwrap();
        assert_eq!(last["reason"], "max-steps");
        assert_eq!(
            events.iter().filter(|e| e["type"] == "tool-call").count(),
            MAX_STEPS
        );
        assert!(events.iter().any(|e| e["type"] == "notice"));
    }

    // A model that sends the same broken call again and again (it never gets the arguments right)
    // must be stopped after a few tries, not left to spend all MAX_STEPS rounds on it.
    #[tokio::test]
    async fn a_model_repeating_the_same_failing_call_is_stopped_early() {
        let s = setup();
        let replies = (0..MAX_STEPS)
            .map(|_| Reply::Sse(openai_tool("x", "read_file", "{}")))
            .collect();
        let mock = spawn_mock(replies).await;
        let events = collect(input(
            &s,
            ProviderKind::Openai,
            &mock.url,
            vec![user("read it")],
        ))
        .await;
        assert_eq!(events.last().unwrap()["reason"], "stalled");
        assert_eq!(
            events.iter().filter(|e| e["type"] == "tool-call").count(),
            MAX_REPEATED_FAILURES
        );
        let notice = events.iter().find(|e| e["type"] == "notice").unwrap();
        let message = notice["message"].as_str().unwrap();
        assert!(message.contains("read_file"), "{message}");
        assert!(message.contains("different model"), "{message}");
    }

    #[tokio::test]
    async fn a_model_that_corrects_its_call_is_not_stopped() {
        let s = setup();
        let mock = spawn_mock(vec![
            Reply::Sse(openai_tool("a", "read_file", "{}")),
            Reply::Sse(openai_tool("b", "read_file", "{}")),
            Reply::Sse(openai_tool("c", "read_file", r#"{"path":"main.tex"}"#)),
            Reply::Sse(openai_text(&["Done."])),
        ])
        .await;
        let events = collect(input(
            &s,
            ProviderKind::Openai,
            &mock.url,
            vec![user("read it")],
        ))
        .await;
        assert_eq!(events.last().unwrap()["reason"], "stop");
        let oks: Vec<_> = events
            .iter()
            .filter(|e| e["type"] == "tool-result")
            .map(|e| e["ok"].as_bool().unwrap())
            .collect();
        assert_eq!(oks, [false, false, true]);
    }

    #[tokio::test]
    async fn an_unreachable_endpoint_says_so() {
        let s = setup();
        // Nothing listens on port 9 (discard) on loopback.
        let events = collect(input(
            &s,
            ProviderKind::Openai,
            "http://127.0.0.1:9/v1",
            vec![user("hi")],
        ))
        .await;
        assert_eq!(types(&events), ["start", "error", "done"]);
        let message = events[1]["message"].as_str().unwrap();
        assert!(message.contains("Couldn't reach Mock"), "{message}");
        assert!(message.contains("local server is running"), "{message}");
    }

    #[tokio::test]
    async fn dropping_the_receiver_cancels_the_run_and_stops_calling_the_model() {
        let s = setup();
        let mock = spawn_mock(vec![Reply::Hang]).await;
        let (tx, rx) = mpsc::channel(256);
        let task = tokio::spawn(run(
            input(&s, ProviderKind::Openai, &mock.url, vec![user("hi")]),
            tx,
        ));
        tokio::time::sleep(Duration::from_millis(300)).await;
        drop(rx); // the stop button
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("run ends promptly")
            .unwrap();
    }
}
