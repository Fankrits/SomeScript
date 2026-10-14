//! Loopback HTTP server. Serves the embedded SPA and the `/api/*` contract the
//! editor UI (apps/editor) already speaks, so the UI runs unchanged.
//!
//! Hardening: 127.0.0.1 only, exact `Host` match (DNS rebinding), and in release a
//! per-launch token exchanged for an HttpOnly SameSite=Strict cookie (img/anchor/worker
//! requests can't carry headers, so a cookie it is).

use crate::{api, api::ApiState};
use axum::{
    Json, Router,
    body::Body,
    extract::{FromRef, Request, State},
    http::{Method, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use std::sync::Arc;
use tauri::AppHandle;

const COOKIE: &str = "ss_token";
const DEV_API_PORT: u16 = 1430;
const CSP: &str = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; \
    worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; \
    font-src 'self' data:; connect-src 'self'";

#[derive(Clone)]
pub struct AppState {
    app: AppHandle,
    api: ApiState,
    host: Arc<str>,
    token: Option<Arc<str>>,
}

impl FromRef<AppState> for ApiState {
    fn from_ref(s: &AppState) -> Self {
        s.api.clone()
    }
}

pub struct Started {
    pub port: u16,
    pub token: Option<String>,
}

pub async fn start(app: AppHandle, api: ApiState) -> std::io::Result<Started> {
    // Debug: fixed port so the Vite proxy can find us, and no token (Vite is the origin).
    // Release: random port + random token. SOMESCRIPT_PORT / SOMESCRIPT_TOKEN pin them so an
    // automated test can open the app's URL; whoever can set them can already read the process.
    let dev = cfg!(debug_assertions);
    let env_u16 = |name: &str| std::env::var(name).ok().and_then(|v| v.parse::<u16>().ok());
    let port = if dev {
        env_u16("SOMESCRIPT_DEV_API_PORT").unwrap_or(DEV_API_PORT)
    } else {
        env_u16("SOMESCRIPT_PORT").unwrap_or(0)
    };
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    let port = listener.local_addr()?.port();
    let token = (!dev).then(|| {
        std::env::var("SOMESCRIPT_TOKEN")
            .ok()
            .filter(|t| t.len() >= 16)
            .unwrap_or_else(random_token)
    });

    let state = AppState {
        app,
        api,
        host: format!("127.0.0.1:{port}").into(),
        token: token.as_deref().map(Into::into),
    };
    let router = Router::new()
        .route("/api/health", get(health))
        .merge(api::router())
        .fallback(assets)
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            log::error!("[server] stopped: {e}");
        }
    });
    Ok(Started { port, token })
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

async fn guard(State(s): State<AppState>, req: Request, next: Next) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok());
    if host != Some(&*s.host) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(token) = s.token.as_deref() else {
        return next.run(req).await;
    };
    if cookie(req.headers(), COOKIE).is_some_and(|c| ct_eq(c, token)) {
        return next.run(req).await;
    }
    // First navigation is /?t=<token>: set the cookie and drop the token from the URL.
    if req.method() == Method::GET
        && query_param(req.uri().query(), "t").is_some_and(|t| ct_eq(t, token))
    {
        return Response::builder()
            .status(StatusCode::SEE_OTHER)
            .header(header::LOCATION, req.uri().path())
            .header(
                header::SET_COOKIE,
                format!("{COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/"),
            )
            .body(Body::empty())
            .unwrap();
    }
    StatusCode::FORBIDDEN.into_response()
}

async fn assets(State(s): State<AppState>, uri: Uri) -> Response {
    let path = uri.path();
    if path.starts_with("/api/") {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Not found" })),
        )
            .into_response();
    }
    let resolver = s.app.asset_resolver();
    let key = if path == "/" { "/index.html" } else { path };
    // SPA fallback only for extension-less routes (/dashboard); a missing .js stays a 404.
    let spa_route = !key.rsplit('/').next().unwrap_or("").contains('.');
    let asset = resolver.get(key.to_string()).or_else(|| {
        spa_route
            .then(|| resolver.get("/index.html".to_string()))
            .flatten()
    });
    let Some(asset) = asset else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let is_html = asset.mime_type.starts_with("text/html");
    let mut resp = Response::new(Body::from(asset.bytes));
    let h = resp.headers_mut();
    h.insert(header::CONTENT_TYPE, asset.mime_type.parse().unwrap());
    if is_html {
        h.insert(header::CONTENT_SECURITY_POLICY, CSP.parse().unwrap());
        h.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    }
    resp
}

fn random_token() -> String {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).expect("OS random source unavailable");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn cookie<'a>(headers: &'a axum::http::HeaderMap, name: &str) -> Option<&'a str> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|kv| {
        let (k, v) = kv.trim().split_once('=')?;
        (k == name).then_some(v)
    })
}

fn query_param<'a>(query: Option<&'a str>, key: &str) -> Option<&'a str> {
    query?.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then_some(v)
    })
}

/// Constant-time string compare so the token can't be probed by timing.
fn ct_eq(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ct_eq_matches_only_equal() {
        assert!(ct_eq("abc", "abc"));
        assert!(!ct_eq("abc", "abd"));
        assert!(!ct_eq("abc", "abcd"));
    }

    #[test]
    fn parses_cookie_and_query() {
        let mut h = axum::http::HeaderMap::new();
        h.insert(header::COOKIE, "a=1; ss_token=xyz; b=2".parse().unwrap());
        assert_eq!(cookie(&h, "ss_token"), Some("xyz"));
        assert_eq!(cookie(&h, "nope"), None);
        assert_eq!(query_param(Some("x=1&t=tok"), "t"), Some("tok"));
        assert_eq!(query_param(None, "t"), None);
    }
}
