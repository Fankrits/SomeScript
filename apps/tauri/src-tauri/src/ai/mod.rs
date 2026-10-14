//! The desktop AI assistant: bring-your-own-key chat that works on the open project.
//!
//! The model is called from Rust, never from the webview, so API keys stay out of the page (and
//! out of its CSP): the UI posts the conversation to `/api/ai/chat` and reads back a stream of
//! events (see `agent`). Providers speak either the OpenAI chat-completions or the Anthropic
//! messages protocol (`protocol`); a "custom endpoint" is just a base URL for one of the two.

pub mod agent;
pub mod protocol;
pub mod settings;
pub mod sse;
pub mod threads;
pub mod tools;

use crate::error::{ApiError, ApiResult};
use std::{
    sync::{Arc, Once, OnceLock},
    time::Duration,
};

/// reqwest is built without a bundled crypto provider (see Cargo.toml), so one must be installed
/// once per process before the first client is made.
pub fn init_tls() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        // Err means another provider is already installed, which is just as good.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// Two clients: loopback endpoints (Ollama, LM Studio, a local proxy) must never be sent through
/// a corporate/system proxy, while everything else should honour it.
///
/// They are built on first use, not at startup: the assistant is optional, so a TLS stack that
/// can't initialise on some machine must show up as an error in the chat, never stop the app
/// (and the editor) from starting.
#[derive(Clone, Default)]
pub struct AiHttp {
    clients: Arc<OnceLock<Result<Clients, String>>>,
}

struct Clients {
    remote: reqwest::Client,
    local: reqwest::Client,
}

impl AiHttp {
    pub fn new() -> Self {
        Self::default()
    }

    fn build() -> Result<Clients, String> {
        init_tls();
        let base = || {
            reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(15))
                .user_agent(concat!("SomeScript-Desktop/", env!("CARGO_PKG_VERSION")))
                // A redirect would resend the API key (custom headers like x-api-key survive
                // redirects) to wherever the server points. Make the user fix the base URL instead.
                .redirect(reqwest::redirect::Policy::none())
        };
        let build = |b: reqwest::ClientBuilder| b.build().map_err(|e| e.to_string());
        Ok(Clients {
            remote: build(base())?,
            local: build(base().no_proxy())?,
        })
    }

    pub fn client_for(&self, base_url: &str) -> ApiResult<reqwest::Client> {
        let clients = self
            .clients
            .get_or_init(Self::build)
            .as_ref()
            .map_err(|e| {
                log::error!("[ai] network stack failed to start: {e}");
                ApiError::new(
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "The assistant couldn't set up its secure connection on this computer.",
                )
            })?;
        Ok(if is_loopback_url(base_url) {
            clients.local.clone()
        } else {
            clients.remote.clone()
        })
    }
}

/// Whether `base_url` points at this computer: Ollama, LM Studio, a local proxy.
pub fn is_loopback_url(base_url: &str) -> bool {
    reqwest::Url::parse(base_url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .is_some_and(|h| {
            h == "localhost"
                || h.ends_with(".localhost")
                || h.trim_matches(['[', ']'])
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        })
}

#[cfg(test)]
mod tests {
    use super::is_loopback_url;

    #[test]
    fn only_addresses_on_this_computer_are_loopback() {
        for url in [
            "http://localhost:11434/v1",
            "http://LOCALHOST:1234/v1",
            "http://127.0.0.1:11434/v1",
            "http://127.1.2.3/v1",
            "http://[::1]:11434/v1",
            "http://ollama.localhost:11434/v1",
        ] {
            assert!(is_loopback_url(url), "{url}");
        }
        for url in [
            "https://api.openai.com/v1",
            "http://192.168.1.20:11434/v1",
            "http://localhost.example.com/v1",
            "http://127.0.0.1.example.com/v1",
            "not a url",
            "",
        ] {
            assert!(!is_loopback_url(url), "{url}");
        }
    }
}

/// A scripted stand-in for a model provider, so the chat can be tested end to end without a key
/// or a network: each POST pops the next reply; GET `.../models` answers a fixed list.
#[cfg(test)]
pub mod testing {
    use axum::{
        Router,
        body::Body,
        extract::{Request, State},
        http::{StatusCode, header},
        response::Response,
    };
    use serde_json::{Value, json};
    use std::{
        collections::{HashMap, VecDeque},
        sync::{Arc, Mutex},
    };
    use tokio_stream::StreamExt;

    pub enum Reply {
        /// A 200 `text/event-stream` body.
        Sse(String),
        Json(StatusCode, Value),
        /// Headers, then silence forever (a model that hangs).
        Hang,
    }

    #[derive(Clone, Debug)]
    pub struct Recorded {
        pub method: String,
        pub path: String,
        /// Lower-cased header names.
        pub headers: HashMap<String, String>,
        pub body: Value,
    }

    #[derive(Default)]
    struct MockState {
        replies: Mutex<VecDeque<Reply>>,
        requests: Mutex<Vec<Recorded>>,
        models: Mutex<Option<(StatusCode, Value)>>,
    }

    pub struct Mock {
        pub url: String,
        state: Arc<MockState>,
    }

    impl Mock {
        pub fn requests(&self) -> Vec<Recorded> {
            self.state.requests.lock().unwrap().clone()
        }

        /// Overrides what `GET .../models` answers.
        pub fn set_models(&self, status: StatusCode, body: Value) {
            *self.state.models.lock().unwrap() = Some((status, body));
        }
    }

    async fn handle(State(st): State<Arc<MockState>>, req: Request) -> Response {
        let (parts, body) = req.into_parts();
        let bytes = axum::body::to_bytes(body, 8 * 1024 * 1024)
            .await
            .unwrap_or_default();
        st.requests.lock().unwrap().push(Recorded {
            method: parts.method.to_string(),
            path: parts.uri.path().to_owned(),
            headers: parts
                .headers
                .iter()
                .map(|(k, v)| (k.as_str().to_owned(), v.to_str().unwrap_or("").to_owned()))
                .collect(),
            body: serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        });
        let json_response = |status: StatusCode, v: &Value| {
            Response::builder()
                .status(status)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(v.to_string()))
                .unwrap()
        };
        if parts.method == axum::http::Method::GET {
            let custom = st.models.lock().unwrap().clone();
            let (status, v) = custom.unwrap_or((
                StatusCode::OK,
                json!({ "data": [{ "id": "mock-1" }, { "id": "mock-2", "display_name": "Mock Two" }] }),
            ));
            return json_response(status, &v);
        }
        let reply = st.replies.lock().unwrap().pop_front();
        match reply {
            Some(Reply::Sse(text)) => Response::builder()
                .header(header::CONTENT_TYPE, "text/event-stream")
                .body(Body::from(text))
                .unwrap(),
            Some(Reply::Json(status, v)) => json_response(status, &v),
            Some(Reply::Hang) => Response::builder()
                .header(header::CONTENT_TYPE, "text/event-stream")
                .body(Body::from_stream(
                    tokio_stream::pending::<Result<axum::body::Bytes, std::convert::Infallible>>()
                        .map(|x| x),
                ))
                .unwrap(),
            None => json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &json!({ "error": { "message": "the mock has no reply left" } }),
            ),
        }
    }

    pub async fn spawn_mock(replies: Vec<Reply>) -> Mock {
        let state = Arc::new(MockState {
            replies: Mutex::new(replies.into()),
            ..Default::default()
        });
        let app = Router::new().fallback(handle).with_state(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        Mock {
            url: format!("http://127.0.0.1:{port}"),
            state,
        }
    }
}
