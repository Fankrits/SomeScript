//! The two wire protocols the assistant speaks, behind one small model:
//!
//! * `openai`: Chat Completions (`POST {base}/chat/completions`), which OpenAI, OpenRouter, Groq,
//!   DeepSeek, Together, Mistral, Gemini's compatibility endpoint, Ollama, LM Studio, vLLM,
//!   LiteLLM, Azure OpenAI and most "custom endpoints" implement.
//! * `anthropic`: Messages (`POST {base}/v1/messages`).
//!
//! Requests are built from our own [`Msg`] history; responses are decoded into [`StreamItem`]s.
//! This is the only module that knows either protocol's JSON, so the agent loop above it is
//! provider-agnostic. Formats follow the providers' public API references:
//! <https://platform.openai.com/docs/api-reference/chat> and
//! <https://docs.anthropic.com/en/api/messages-streaming>.

use super::{
    settings::{Provider, ProviderKind},
    sse::SseEvent,
};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

pub const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Anthropic requires an explicit cap; OpenAI-style servers get their own default.
const ANTHROPIC_MAX_TOKENS: u32 = 8192;

#[derive(Clone, Debug, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
    /// Set when the model's argument text wasn't valid JSON; the tool then reports it back.
    pub args_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Msg {
    User(String),
    Assistant {
        text: String,
        calls: Vec<ToolCall>,
    },
    Tool {
        call_id: String,
        name: String,
        content: String,
    },
}

#[derive(Clone, Debug)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    /// JSON Schema for the arguments object.
    pub schema: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Finish {
    Stop,
    ToolCalls,
    Length,
    /// A refusal or any reason we don't model; the text is for the log, not for logic.
    Other(String),
}

#[derive(Clone, Debug, PartialEq)]
pub enum StreamItem {
    Text(String),
    Reasoning(String),
    Usage { input: u64, output: u64 },
    ToolCall(ToolCall),
    Finish(Finish),
}

/// `{base}/{tail}` keeping the base's query string (Azure's `?api-version=`).
pub fn endpoint(base: &str, tail: &str) -> String {
    match reqwest::Url::parse(base) {
        Ok(mut url) => {
            let path = format!("{}/{}", url.path().trim_end_matches('/'), tail);
            url.set_path(&path);
            url.to_string()
        }
        Err(_) => format!("{}/{}", base.trim_end_matches('/'), tail),
    }
}

pub fn chat_url(provider: &Provider) -> String {
    match provider.kind {
        ProviderKind::Openai => endpoint(&provider.base_url, "chat/completions"),
        ProviderKind::Anthropic => anthropic_url(&provider.base_url, "messages"),
    }
}

pub fn models_url(provider: &Provider) -> String {
    match provider.kind {
        ProviderKind::Openai => endpoint(&provider.base_url, "models"),
        ProviderKind::Anthropic => anthropic_url(&provider.base_url, "models"),
    }
}

/// Accepts both `https://api.anthropic.com` and `https://api.anthropic.com/v1`.
fn anthropic_url(base: &str, tail: &str) -> String {
    let has_v1 = reqwest::Url::parse(base)
        .map(|u| u.path().trim_end_matches('/').ends_with("/v1"))
        .unwrap_or(false);
    endpoint(
        base,
        &if has_v1 {
            tail.to_owned()
        } else {
            format!("v1/{tail}")
        },
    )
}

/// Headers for an authenticated request (without content type).
pub fn auth_headers(provider: &Provider) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    if provider.kind == ProviderKind::Anthropic {
        headers.push(("anthropic-version".to_owned(), ANTHROPIC_VERSION.to_owned()));
    }
    if provider.api_key.is_empty() {
        return headers; // local servers (Ollama, LM Studio) take no key
    }
    let default_header = match provider.kind {
        ProviderKind::Openai => "Authorization",
        ProviderKind::Anthropic => "x-api-key",
    };
    let name = if provider.api_key_header.is_empty() {
        default_header
    } else {
        provider.api_key_header.as_str()
    };
    let value = if name.eq_ignore_ascii_case("authorization") {
        format!("Bearer {}", provider.api_key)
    } else {
        provider.api_key.clone()
    };
    headers.push((name.to_owned(), value));
    headers
}

pub fn build_body(
    provider: &Provider,
    model: &str,
    system: &str,
    history: &[Msg],
    tools: &[ToolSpec],
) -> Value {
    match provider.kind {
        ProviderKind::Openai => openai_body(model, system, history, tools),
        ProviderKind::Anthropic => anthropic_body(model, system, history, tools),
    }
}

fn openai_body(model: &str, system: &str, history: &[Msg], tools: &[ToolSpec]) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": system })];
    for msg in history {
        match msg {
            Msg::User(text) => messages.push(json!({ "role": "user", "content": text })),
            Msg::Assistant { text, calls } => {
                if text.is_empty() && calls.is_empty() {
                    continue; // empty assistant turns are rejected by most servers
                }
                let mut m = Map::new();
                m.insert("role".into(), json!("assistant"));
                m.insert(
                    "content".into(),
                    if text.is_empty() {
                        Value::Null
                    } else {
                        json!(text)
                    },
                );
                if !calls.is_empty() {
                    let calls: Vec<Value> = calls
                        .iter()
                        .map(|c| {
                            json!({
                                "id": c.id,
                                "type": "function",
                                "function": { "name": c.name, "arguments": c.args.to_string() },
                            })
                        })
                        .collect();
                    m.insert("tool_calls".into(), json!(calls));
                }
                messages.push(Value::Object(m));
            }
            Msg::Tool {
                call_id, content, ..
            } => messages
                .push(json!({ "role": "tool", "tool_call_id": call_id, "content": content })),
        }
    }
    let mut body = json!({ "model": model, "stream": true, "messages": messages });
    if !tools.is_empty() {
        body["tools"] = json!(
            tools
                .iter()
                .map(|t| json!({
                    "type": "function",
                    "function": { "name": t.name, "description": t.description, "parameters": t.schema },
                }))
                .collect::<Vec<_>>()
        );
    }
    body
}

fn anthropic_body(model: &str, system: &str, history: &[Msg], tools: &[ToolSpec]) -> Value {
    // Anthropic wants strictly alternating user/assistant turns, with every tool_result in the
    // user turn right after the assistant turn that asked for it (and before any text).
    let mut turns: Vec<Value> = Vec::new();
    let mut user_blocks: Vec<Value> = Vec::new();
    let mut user_tool_results = 0usize;
    let flush_user = |turns: &mut Vec<Value>, blocks: &mut Vec<Value>, results: &mut usize| {
        if !blocks.is_empty() {
            turns.push(json!({ "role": "user", "content": std::mem::take(blocks) }));
        }
        *results = 0;
    };
    for msg in history {
        match msg {
            Msg::User(text) => user_blocks.push(json!({ "type": "text", "text": text })),
            Msg::Tool {
                call_id, content, ..
            } => {
                // tool_result blocks go first in the user turn.
                user_blocks.insert(
                    user_tool_results,
                    json!({ "type": "tool_result", "tool_use_id": call_id, "content": content }),
                );
                user_tool_results += 1;
            }
            Msg::Assistant { text, calls } => {
                flush_user(&mut turns, &mut user_blocks, &mut user_tool_results);
                let mut blocks: Vec<Value> = Vec::new();
                if !text.is_empty() {
                    blocks.push(json!({ "type": "text", "text": text }));
                }
                for c in calls {
                    blocks.push(
                        json!({ "type": "tool_use", "id": c.id, "name": c.name, "input": c.args }),
                    );
                }
                if !blocks.is_empty() {
                    turns.push(json!({ "role": "assistant", "content": blocks }));
                }
            }
        }
    }
    flush_user(&mut turns, &mut user_blocks, &mut user_tool_results);

    let mut body = json!({
        "model": model,
        "max_tokens": ANTHROPIC_MAX_TOKENS,
        "stream": true,
        "system": system,
        "messages": turns,
    });
    if !tools.is_empty() {
        body["tools"] = json!(
            tools
                .iter()
                .map(|t| json!({ "name": t.name, "description": t.description, "input_schema": t.schema }))
                .collect::<Vec<_>>()
        );
    }
    body
}

// ---- streaming decoders ----------------------------------------------------------------

pub trait StreamDecoder: Send {
    /// One SSE record in. `Err` is an error the provider reported inside the stream.
    fn feed(&mut self, event: &SseEvent) -> Result<Vec<StreamItem>, String>;
    /// The connection closed: anything still buffered (an unterminated tool call) comes out.
    fn finish(&mut self) -> Vec<StreamItem>;
}

pub fn decoder(kind: ProviderKind) -> Box<dyn StreamDecoder> {
    match kind {
        ProviderKind::Openai => Box::new(OpenAiDecoder::default()),
        ProviderKind::Anthropic => Box::new(AnthropicDecoder::default()),
    }
}

fn parse_args(raw: &str) -> (Value, Option<String>) {
    if raw.trim().is_empty() {
        return (json!({}), None);
    }
    match serde_json::from_str::<Value>(raw) {
        Ok(v @ Value::Object(_)) => (v, None),
        Ok(_) => (
            json!({}),
            Some("The tool arguments must be a JSON object.".into()),
        ),
        Err(e) => (
            json!({}),
            Some(format!("The tool arguments were not valid JSON ({e}).")),
        ),
    }
}

fn error_text(v: &Value) -> Option<String> {
    let err = v.get("error")?;
    let message = err
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| err.as_str())
        .unwrap_or("The provider reported an error.");
    Some(message.to_owned())
}

#[derive(Default)]
struct PendingCall {
    id: String,
    name: String,
    args: String,
}

#[derive(Default)]
struct OpenAiDecoder {
    pending: BTreeMap<usize, PendingCall>,
    finished: bool,
    synthetic_ids: usize,
}

impl OpenAiDecoder {
    fn flush_calls(&mut self, out: &mut Vec<StreamItem>) {
        for (_, call) in std::mem::take(&mut self.pending) {
            if call.name.is_empty() {
                continue;
            }
            let (args, args_error) = parse_args(&call.args);
            let id = if call.id.is_empty() {
                self.synthetic_ids += 1;
                format!("call_{}", self.synthetic_ids)
            } else {
                call.id
            };
            out.push(StreamItem::ToolCall(ToolCall {
                id,
                name: call.name,
                args,
                args_error,
            }));
        }
    }

    fn delta_tool_call(&mut self, tc: &Value, position: usize) {
        let mut index = tc
            .get("index")
            .and_then(Value::as_u64)
            .map_or(position, |i| i as usize);
        let id = tc.get("id").and_then(Value::as_str).unwrap_or("");
        // Some servers reuse index 0 for every parallel call and only tell them apart by id.
        if let Some(existing) = self.pending.get(&index)
            && !id.is_empty()
            && !existing.id.is_empty()
            && existing.id != id
        {
            index = self.pending.keys().next_back().map_or(0, |k| k + 1);
        }
        let entry = self.pending.entry(index).or_default();
        if !id.is_empty() {
            entry.id = id.to_owned();
        }
        if let Some(f) = tc.get("function") {
            if let Some(name) = f.get("name").and_then(Value::as_str) {
                entry.name.push_str(name);
            }
            if let Some(args) = f.get("arguments").and_then(Value::as_str) {
                entry.args.push_str(args);
            }
        }
    }
}

impl StreamDecoder for OpenAiDecoder {
    fn feed(&mut self, event: &SseEvent) -> Result<Vec<StreamItem>, String> {
        let data = event.data.trim();
        let mut out = Vec::new();
        if data == "[DONE]" {
            self.flush_calls(&mut out);
            return Ok(out);
        }
        let v: Value = serde_json::from_str(data)
            .map_err(|_| "The provider sent a reply this app can't read.".to_owned())?;
        if let Some(message) = error_text(&v) {
            return Err(message);
        }
        if let Some(usage) = v.get("usage").filter(|u| u.is_object()) {
            let n = |k: &str| usage.get(k).and_then(Value::as_u64).unwrap_or(0);
            out.push(StreamItem::Usage {
                input: n("prompt_tokens"),
                output: n("completion_tokens"),
            });
        }
        let Some(choice) = v.pointer("/choices/0") else {
            return Ok(out);
        };
        if let Some(delta) = choice.get("delta") {
            match delta.get("content") {
                Some(Value::String(s)) if !s.is_empty() => out.push(StreamItem::Text(s.clone())),
                Some(Value::Array(parts)) => {
                    for p in parts {
                        if let Some(t) = p.get("text").and_then(Value::as_str)
                            && !t.is_empty()
                        {
                            out.push(StreamItem::Text(t.to_owned()));
                        }
                    }
                }
                _ => {}
            }
            // DeepSeek/Ollama call it reasoning_content, OpenRouter calls it reasoning.
            for key in ["reasoning_content", "reasoning"] {
                if let Some(Value::String(s)) = delta.get(key)
                    && !s.is_empty()
                {
                    out.push(StreamItem::Reasoning(s.clone()));
                    break;
                }
            }
            if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
                for (i, tc) in calls.iter().enumerate() {
                    self.delta_tool_call(tc, i);
                }
            }
        }
        if let Some(reason) = choice.get("finish_reason").and_then(Value::as_str)
            && !self.finished
        {
            self.finished = true;
            let had_calls = !self.pending.is_empty();
            self.flush_calls(&mut out);
            out.push(StreamItem::Finish(match reason {
                "stop" if had_calls => Finish::ToolCalls,
                "stop" => Finish::Stop,
                "tool_calls" | "function_call" => Finish::ToolCalls,
                "length" => Finish::Length,
                other => Finish::Other(other.to_owned()),
            }));
        }
        Ok(out)
    }

    fn finish(&mut self) -> Vec<StreamItem> {
        let mut out = Vec::new();
        let had_calls = !self.pending.is_empty();
        self.flush_calls(&mut out);
        if !self.finished {
            self.finished = true;
            out.push(StreamItem::Finish(if had_calls {
                Finish::ToolCalls
            } else {
                Finish::Stop
            }));
        }
        out
    }
}

#[derive(Default)]
struct AnthropicDecoder {
    /// Open `tool_use` blocks by content-block index.
    blocks: BTreeMap<usize, PendingCall>,
    input_tokens: u64,
    output_tokens: u64,
    finished: bool,
}

impl StreamDecoder for AnthropicDecoder {
    fn feed(&mut self, event: &SseEvent) -> Result<Vec<StreamItem>, String> {
        let v: Value = serde_json::from_str(event.data.trim())
            .map_err(|_| "The provider sent a reply this app can't read.".to_owned())?;
        let kind = event
            .event
            .as_deref()
            .or_else(|| v.get("type").and_then(Value::as_str))
            .unwrap_or_default();
        let index = v.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
        let mut out = Vec::new();
        match kind {
            "error" => {
                return Err(
                    error_text(&v).unwrap_or_else(|| "The provider reported an error.".into())
                );
            }
            "message_start" => {
                let usage = v.pointer("/message/usage");
                let n = |k: &str| {
                    usage
                        .and_then(|u| u.get(k))
                        .and_then(Value::as_u64)
                        .unwrap_or(0)
                };
                self.input_tokens = n("input_tokens")
                    + n("cache_read_input_tokens")
                    + n("cache_creation_input_tokens");
                self.output_tokens = n("output_tokens");
            }
            "content_block_start" => {
                let block = v.get("content_block");
                if block.and_then(|b| b.get("type")).and_then(Value::as_str) == Some("tool_use") {
                    let text = |k: &str| {
                        block
                            .and_then(|b| b.get(k))
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_owned()
                    };
                    self.blocks.insert(
                        index,
                        PendingCall {
                            id: text("id"),
                            name: text("name"),
                            args: String::new(),
                        },
                    );
                }
            }
            "content_block_delta" => {
                let delta = v.get("delta");
                let field = |k: &str| delta.and_then(|d| d.get(k)).and_then(Value::as_str);
                match delta.and_then(|d| d.get("type")).and_then(Value::as_str) {
                    Some("text_delta") => {
                        if let Some(t) = field("text").filter(|t| !t.is_empty()) {
                            out.push(StreamItem::Text(t.to_owned()));
                        }
                    }
                    Some("thinking_delta") => {
                        if let Some(t) = field("thinking").filter(|t| !t.is_empty()) {
                            out.push(StreamItem::Reasoning(t.to_owned()));
                        }
                    }
                    Some("input_json_delta") => {
                        if let (Some(call), Some(part)) =
                            (self.blocks.get_mut(&index), field("partial_json"))
                        {
                            call.args.push_str(part);
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                if let Some(call) = self.blocks.remove(&index) {
                    let (args, args_error) = parse_args(&call.args);
                    out.push(StreamItem::ToolCall(ToolCall {
                        id: call.id,
                        name: call.name,
                        args,
                        args_error,
                    }));
                }
            }
            "message_delta" => {
                if let Some(n) = v.pointer("/usage/output_tokens").and_then(Value::as_u64) {
                    self.output_tokens = n;
                }
                out.push(StreamItem::Usage {
                    input: self.input_tokens,
                    output: self.output_tokens,
                });
                if let Some(reason) = v.pointer("/delta/stop_reason").and_then(Value::as_str) {
                    self.finished = true;
                    out.push(StreamItem::Finish(match reason {
                        "end_turn" | "stop_sequence" => Finish::Stop,
                        "tool_use" => Finish::ToolCalls,
                        "max_tokens" => Finish::Length,
                        other => Finish::Other(other.to_owned()),
                    }));
                }
            }
            _ => {} // ping, message_stop, unknown future events
        }
        Ok(out)
    }

    fn finish(&mut self) -> Vec<StreamItem> {
        if self.finished {
            return Vec::new();
        }
        self.finished = true;
        vec![StreamItem::Finish(Finish::Stop)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::sse::SseDecoder;

    fn provider(kind: ProviderKind, base: &str, key: &str) -> Provider {
        Provider {
            id: "p1".into(),
            name: "t".into(),
            kind,
            base_url: base.into(),
            api_key: key.into(),
            ..Default::default()
        }
    }

    fn spec() -> ToolSpec {
        ToolSpec {
            name: "read-file".into(),
            description: "Reads a file".into(),
            schema: json!({ "type": "object", "properties": { "path": { "type": "string" } } }),
        }
    }

    fn call(id: &str, name: &str, args: Value) -> ToolCall {
        ToolCall {
            id: id.into(),
            name: name.into(),
            args,
            args_error: None,
        }
    }

    fn decode(kind: ProviderKind, raw: &str) -> (Vec<StreamItem>, Option<String>) {
        let mut sse = SseDecoder::default();
        let mut dec = decoder(kind);
        let mut items = Vec::new();
        let mut events = sse.push(raw.as_bytes());
        events.extend(sse.finish());
        for e in events {
            match dec.feed(&e) {
                Ok(i) => items.extend(i),
                Err(m) => return (items, Some(m)),
            }
        }
        items.extend(dec.finish());
        (items, None)
    }

    // ---- URLs and headers ----

    #[test]
    fn urls_join_paths_and_keep_queries() {
        let p = provider(ProviderKind::Openai, "https://api.openai.com/v1", "");
        assert_eq!(chat_url(&p), "https://api.openai.com/v1/chat/completions");
        assert_eq!(models_url(&p), "https://api.openai.com/v1/models");
        let azure = provider(
            ProviderKind::Openai,
            "https://x.openai.azure.com/openai/deployments/d?api-version=2024-10-21",
            "",
        );
        assert_eq!(
            chat_url(&azure),
            "https://x.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-10-21"
        );
        let local = provider(ProviderKind::Openai, "http://localhost:11434/v1", "");
        assert_eq!(
            chat_url(&local),
            "http://localhost:11434/v1/chat/completions"
        );
    }

    #[test]
    fn anthropic_urls_accept_a_base_with_or_without_v1() {
        for base in ["https://api.anthropic.com", "https://api.anthropic.com/v1"] {
            let p = provider(ProviderKind::Anthropic, base, "");
            assert_eq!(
                chat_url(&p),
                "https://api.anthropic.com/v1/messages",
                "{base}"
            );
            assert_eq!(
                models_url(&p),
                "https://api.anthropic.com/v1/models",
                "{base}"
            );
        }
        let proxy = provider(
            ProviderKind::Anthropic,
            "https://gw.example.com/anthropic",
            "",
        );
        assert_eq!(
            chat_url(&proxy),
            "https://gw.example.com/anthropic/v1/messages"
        );
    }

    #[test]
    fn auth_headers_follow_each_protocol() {
        let find = |h: &[(String, String)], n: &str| {
            h.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(n))
                .map(|(_, v)| v.clone())
        };
        let o = auth_headers(&provider(ProviderKind::Openai, "https://x", "sk-1"));
        assert_eq!(find(&o, "authorization").as_deref(), Some("Bearer sk-1"));
        let a = auth_headers(&provider(ProviderKind::Anthropic, "https://x", "sk-ant"));
        assert_eq!(find(&a, "x-api-key").as_deref(), Some("sk-ant"));
        assert_eq!(
            find(&a, "anthropic-version").as_deref(),
            Some(ANTHROPIC_VERSION)
        );
        assert!(find(&a, "authorization").is_none());

        let mut azure = provider(ProviderKind::Openai, "https://x", "azure-key");
        azure.api_key_header = "api-key".into();
        let h = auth_headers(&azure);
        assert_eq!(find(&h, "api-key").as_deref(), Some("azure-key"));
        assert!(find(&h, "authorization").is_none());

        // A custom header that is literally Authorization still gets the Bearer scheme.
        let mut bearer = provider(ProviderKind::Anthropic, "https://x", "tok");
        bearer.api_key_header = "authorization".into();
        assert_eq!(
            find(&auth_headers(&bearer), "authorization").as_deref(),
            Some("Bearer tok")
        );

        // No key (Ollama): no auth header at all.
        assert!(auth_headers(&provider(ProviderKind::Openai, "http://localhost", "")).is_empty());
    }

    // ---- request bodies ----

    fn history() -> Vec<Msg> {
        vec![
            Msg::User("fix main.tex".into()),
            Msg::Assistant {
                text: "Reading it.".into(),
                calls: vec![
                    call("c1", "read-file", json!({ "path": "main.tex" })),
                    call("c2", "read-file", json!({ "path": "refs.bib" })),
                ],
            },
            Msg::Tool {
                call_id: "c1".into(),
                name: "read-file".into(),
                content: "main".into(),
            },
            Msg::Tool {
                call_id: "c2".into(),
                name: "read-file".into(),
                content: "refs".into(),
            },
            Msg::Assistant {
                text: "Done.".into(),
                calls: vec![],
            },
            Msg::User("thanks".into()),
        ]
    }

    #[test]
    fn openai_body_has_system_tool_calls_and_tool_results() {
        let p = provider(ProviderKind::Openai, "https://x/v1", "k");
        let body = build_body(&p, "gpt-4.1", "SYS", &history(), &[spec()]);
        assert_eq!(body["model"], "gpt-4.1");
        assert_eq!(body["stream"], true);
        let m = body["messages"].as_array().unwrap();
        assert_eq!(m[0], json!({ "role": "system", "content": "SYS" }));
        assert_eq!(m[1], json!({ "role": "user", "content": "fix main.tex" }));
        assert_eq!(m[2]["role"], "assistant");
        assert_eq!(m[2]["content"], "Reading it.");
        assert_eq!(m[2]["tool_calls"][0]["id"], "c1");
        assert_eq!(m[2]["tool_calls"][0]["type"], "function");
        // Arguments travel as a JSON *string*, per the Chat Completions spec.
        assert_eq!(
            m[2]["tool_calls"][1]["function"]["arguments"],
            "{\"path\":\"refs.bib\"}"
        );
        assert_eq!(
            m[3],
            json!({ "role": "tool", "tool_call_id": "c1", "content": "main" })
        );
        assert_eq!(m[4]["tool_call_id"], "c2");
        assert_eq!(m[6]["content"], "thanks");
        assert_eq!(body["tools"][0]["function"]["name"], "read-file");
        assert!(body["tools"][0]["function"]["parameters"].is_object());
    }

    #[test]
    fn openai_body_skips_empty_assistant_turns_and_nulls_content_for_pure_tool_calls() {
        let p = provider(ProviderKind::Openai, "https://x/v1", "k");
        let hist = vec![
            Msg::User("a".into()),
            Msg::Assistant {
                text: String::new(),
                calls: vec![],
            },
            Msg::Assistant {
                text: String::new(),
                calls: vec![call("c", "read-file", json!({}))],
            },
        ];
        let body = build_body(&p, "m", "S", &hist, &[]);
        let m = body["messages"].as_array().unwrap();
        assert_eq!(m.len(), 3);
        assert!(m[2]["content"].is_null());
        assert!(body.get("tools").is_none());
    }

    #[test]
    fn anthropic_body_groups_tool_results_into_one_user_turn() {
        let p = provider(ProviderKind::Anthropic, "https://api.anthropic.com", "k");
        let body = build_body(&p, "claude-sonnet-5-5", "SYS", &history(), &[spec()]);
        assert_eq!(body["system"], "SYS");
        assert_eq!(body["max_tokens"], ANTHROPIC_MAX_TOKENS);
        let m = body["messages"].as_array().unwrap();
        let roles: Vec<&str> = m.iter().map(|t| t["role"].as_str().unwrap()).collect();
        assert_eq!(roles, ["user", "assistant", "user", "assistant", "user"]);
        let asst = m[1]["content"].as_array().unwrap();
        assert_eq!(asst[0], json!({ "type": "text", "text": "Reading it." }));
        assert_eq!(asst[1]["type"], "tool_use");
        assert_eq!(asst[1]["input"], json!({ "path": "main.tex" }));
        let results = m[2]["content"].as_array().unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["type"], "tool_result");
        assert_eq!(results[0]["tool_use_id"], "c1");
        assert_eq!(results[1]["tool_use_id"], "c2");
        assert_eq!(body["tools"][0]["input_schema"]["type"], "object");
    }

    #[test]
    fn anthropic_puts_tool_results_before_a_following_user_text() {
        let p = provider(ProviderKind::Anthropic, "https://api.anthropic.com", "k");
        let hist = vec![
            Msg::User("go".into()),
            Msg::Assistant {
                text: String::new(),
                calls: vec![call("c1", "grep", json!({}))],
            },
            Msg::User("also this".into()),
            Msg::Tool {
                call_id: "c1".into(),
                name: "grep".into(),
                content: "r".into(),
            },
        ];
        let body = build_body(&p, "m", "S", &hist, &[]);
        let last = body["messages"].as_array().unwrap().last().unwrap().clone();
        let blocks = last["content"].as_array().unwrap();
        assert_eq!(blocks[0]["type"], "tool_result");
        assert_eq!(blocks[1]["type"], "text");
    }

    // ---- OpenAI stream ----

    #[test]
    fn openai_text_stream_with_usage() {
        let (items, err) = decode(
            ProviderKind::Openai,
            concat!(
                "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
                "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":3}}\n\n",
                "data: [DONE]\n\n",
            ),
        );
        assert_eq!(err, None);
        assert_eq!(
            items,
            vec![
                StreamItem::Text("Hel".into()),
                StreamItem::Text("lo".into()),
                StreamItem::Finish(Finish::Stop),
                StreamItem::Usage {
                    input: 12,
                    output: 3
                },
            ]
        );
    }

    #[test]
    fn openai_tool_calls_are_assembled_from_fragments_in_index_order() {
        let (items, err) = decode(
            ProviderKind::Openai,
            concat!(
                "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_a\",\"type\":\"function\",\"function\":{\"name\":\"read-file\",\"arguments\":\"\"}}]}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":1,\"id\":\"call_b\",\"function\":{\"name\":\"grep\",\"arguments\":\"{\\\"query\\\":\"}}]}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"path\\\":\\\"main.tex\\\"}\"}}]}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":1,\"function\":{\"arguments\":\"\\\"cite\\\"}\"}}]}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n",
                "data: [DONE]\n\n",
            ),
        );
        assert_eq!(err, None);
        assert_eq!(
            items,
            vec![
                StreamItem::ToolCall(call("call_a", "read-file", json!({ "path": "main.tex" }))),
                StreamItem::ToolCall(call("call_b", "grep", json!({ "query": "cite" }))),
                StreamItem::Finish(Finish::ToolCalls),
            ]
        );
    }

    #[test]
    fn openai_servers_that_reuse_index_zero_still_yield_separate_calls() {
        let (items, _) = decode(
            ProviderKind::Openai,
            concat!(
                "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"a\",\"function\":{\"name\":\"read-file\",\"arguments\":\"{}\"}}]}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"b\",\"function\":{\"name\":\"list-files\",\"arguments\":\"{}\"}}]},\"finish_reason\":\"stop\"}]}\n\n",
            ),
        );
        let names: Vec<_> = items
            .iter()
            .filter_map(|i| match i {
                StreamItem::ToolCall(c) => Some((c.id.as_str(), c.name.as_str())),
                _ => None,
            })
            .collect();
        assert_eq!(names, [("a", "read-file"), ("b", "list-files")]);
        // Some servers say "stop" even when they asked for tools; the calls win.
        assert!(items.contains(&StreamItem::Finish(Finish::ToolCalls)));
    }

    #[test]
    fn openai_missing_ids_are_synthesised_and_bad_arguments_are_reported() {
        let (items, _) = decode(
            ProviderKind::Openai,
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"function\":{\"name\":\"read-file\",\"arguments\":\"{broken\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n",
        );
        let StreamItem::ToolCall(c) = &items[0] else {
            panic!("{items:?}")
        };
        assert_eq!(c.id, "call_1");
        assert!(c.args_error.as_deref().unwrap().contains("not valid JSON"));
        assert_eq!(c.args, json!({}));
    }

    #[test]
    fn openai_reasoning_deltas_and_array_content() {
        let (items, _) = decode(
            ProviderKind::Openai,
            concat!(
                "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"think\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"reasoning\":\"more\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}}]}\n\n",
            ),
        );
        assert_eq!(
            &items[..3],
            [
                StreamItem::Reasoning("think".into()),
                StreamItem::Reasoning("more".into()),
                StreamItem::Text("hi".into()),
            ]
        );
    }

    #[test]
    fn openai_stream_that_just_ends_still_finishes() {
        let (items, err) = decode(
            ProviderKind::Openai,
            "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
        );
        assert_eq!(err, None);
        assert_eq!(
            items,
            vec![
                StreamItem::Text("partial".into()),
                StreamItem::Finish(Finish::Stop)
            ]
        );
    }

    #[test]
    fn openai_in_stream_errors_and_garbage_are_reported() {
        let (_, err) = decode(
            ProviderKind::Openai,
            "data: {\"error\":{\"message\":\"Rate limit reached\",\"type\":\"x\"}}\n\n",
        );
        assert_eq!(err.as_deref(), Some("Rate limit reached"));
        let (_, err) = decode(ProviderKind::Openai, "data: <html>gateway</html>\n\n");
        assert!(err.unwrap().contains("can't read"));
    }

    // ---- Anthropic stream ----

    #[test]
    fn anthropic_text_and_tool_use_stream() {
        let raw = concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":25,\"output_tokens\":1}}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: ping\ndata: {\"type\":\"ping\"}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Let me \"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"look.\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_01\",\"name\":\"read-file\",\"input\":{}}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"path\\\": \\\"ma\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"in.tex\\\"}\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":60}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        );
        let (items, err) = decode(ProviderKind::Anthropic, raw);
        assert_eq!(err, None);
        assert_eq!(
            items,
            vec![
                StreamItem::Text("Let me ".into()),
                StreamItem::Text("look.".into()),
                StreamItem::ToolCall(call("toolu_01", "read-file", json!({ "path": "main.tex" }))),
                StreamItem::Usage {
                    input: 25,
                    output: 60
                },
                StreamItem::Finish(Finish::ToolCalls),
            ]
        );
    }

    #[test]
    fn anthropic_thinking_stop_reasons_and_errors() {
        let (items, _) = decode(
            ProviderKind::Anthropic,
            concat!(
                "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"hmm\"}}\n\n",
                "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"max_tokens\"},\"usage\":{\"output_tokens\":8192}}\n\n",
            ),
        );
        assert_eq!(items[0], StreamItem::Reasoning("hmm".into()));
        assert!(items.contains(&StreamItem::Finish(Finish::Length)));

        let (_, err) = decode(
            ProviderKind::Anthropic,
            "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n",
        );
        assert_eq!(err.as_deref(), Some("Overloaded"));
    }

    #[test]
    fn anthropic_uses_the_type_field_when_the_event_line_is_missing() {
        // Some gateways forward only `data:` lines.
        let (items, _) = decode(
            ProviderKind::Anthropic,
            concat!(
                "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}\n\n",
                "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":2}}\n\n",
            ),
        );
        assert_eq!(items[0], StreamItem::Text("ok".into()));
        assert!(items.contains(&StreamItem::Finish(Finish::Stop)));
    }
}
