//! The app's global AI settings: which providers the user has configured, their API keys, and
//! the active model. Global means per user, not per project: one set of keys for every project.
//!
//! The file lives in the OS app-config dir (`ai.json`) and is the only place a key is stored.
//! It is written with owner-only permissions on Unix. Keys are never sent to the webview: the
//! UI sees `hasKey` and the last four characters, and the chat itself is run by the Rust server.
//! (A keychain would be stronger at rest, but it needs a running secret service on Linux and
//! fails silently in headless/CI sessions; an owner-only file is what `gh`, `aws` and `ssh` use.)

use crate::error::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::RwLock,
};

pub const MAX_PROVIDERS: usize = 20;
const MAX_NAME: usize = 60;
const MAX_URL: usize = 300;
const MAX_KEY: usize = 4096;
const MAX_MODELS: usize = 200;
const MAX_MODEL_NAME: usize = 200;
const MAX_INSTRUCTIONS: usize = 4000;
const MAX_HEADER_NAME: usize = 64;

/// Which wire protocol a provider speaks. Almost everything else (OpenRouter, Groq, Ollama,
/// LM Studio, vLLM, LiteLLM, Gemini's compatibility endpoint, Azure...) speaks the OpenAI one.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    #[default]
    Openai,
    Anthropic,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub api_key: String,
    /// Header that carries the key when it isn't the protocol's default (`Authorization: Bearer`
    /// for OpenAI-style, `x-api-key` for Anthropic). Azure OpenAI wants `api-key`, for instance.
    pub api_key_header: String,
    /// Models offered in the picker. Free text is accepted too, so this is a convenience list.
    pub models: Vec<String>,
    pub default_model: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AiSettings {
    pub providers: Vec<Provider>,
    pub active_provider_id: Option<String>,
    pub active_model: Option<String>,
    /// Extra instructions appended to the assistant's system prompt (the user's own style rules).
    pub custom_instructions: String,
}

/// What the Settings screen sends when saving a provider.
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    /// `None`/absent keeps the stored key; a value replaces it.
    pub api_key: Option<String>,
    pub clear_key: bool,
    pub api_key_header: String,
    pub models: Vec<String>,
    pub default_model: String,
}

impl Provider {
    /// The view the webview gets: everything except the key itself.
    pub fn public(&self) -> Value {
        let hint: String = if self.api_key.chars().count() >= 12 {
            self.api_key
                .chars()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect()
        } else {
            String::new()
        };
        json!({
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "baseUrl": self.base_url,
            "hasKey": !self.api_key.is_empty(),
            "keyHint": hint,
            "apiKeyHeader": self.api_key_header,
            "models": self.models,
            "defaultModel": self.default_model,
        })
    }
}

impl AiSettings {
    pub fn public(&self) -> Value {
        json!({
            "providers": self.providers.iter().map(Provider::public).collect::<Vec<_>>(),
            "activeProviderId": self.active_provider_id,
            "activeModel": self.active_model,
            "customInstructions": self.custom_instructions,
        })
    }

    pub fn provider(&self, id: &str) -> Option<&Provider> {
        self.providers.iter().find(|p| p.id == id)
    }

    /// Picks the provider and model for a chat. An explicit choice beats the saved one, which
    /// beats "the first provider that has a model".
    pub fn resolve(
        &self,
        provider_id: Option<&str>,
        model: Option<&str>,
    ) -> ApiResult<(Provider, String)> {
        if self.providers.is_empty() {
            return Err(ApiError::bad_request(
                "No AI provider is set up yet. Open Settings from the dashboard and add one.",
            ));
        }
        let wanted = provider_id
            .filter(|s| !s.is_empty())
            .or(self.active_provider_id.as_deref());
        let provider = wanted
            .and_then(|id| self.provider(id))
            .or_else(|| self.providers.first())
            .expect("providers is non-empty");
        let saved_model = (self.active_provider_id.as_deref() == Some(provider.id.as_str()))
            .then_some(self.active_model.as_deref())
            .flatten();
        let model = model
            .filter(|m| !m.trim().is_empty())
            .or(saved_model)
            .or(Some(provider.default_model.as_str()).filter(|m| !m.is_empty()))
            .or(provider.models.first().map(String::as_str))
            .ok_or_else(|| {
                ApiError::bad_request(format!(
                    "Choose a model for \"{}\" in Settings.",
                    provider.name
                ))
            })?;
        Ok((provider.clone(), model.trim().to_owned()))
    }
}

/// Validates and normalises an endpoint: http(s) only, a real host, no credentials in the URL
/// (they would be logged and shown), no fragment. A query string is kept (Azure's `api-version`).
pub fn normalize_base_url(raw: &str) -> Result<String, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Base URL is required.".into());
    }
    if raw.chars().count() > MAX_URL {
        return Err("Base URL is too long.".into());
    }
    let mut url = reqwest::Url::parse(raw)
        .map_err(|_| "Base URL must look like https://api.example.com/v1".to_owned())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Base URL must start with http:// or https://".into());
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err("Base URL needs a host name.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Don't put credentials in the URL; use the API key field.".into());
    }
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/').to_owned();
    url.set_path(&path);
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn clean_models(models: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for m in models {
        let m = m.trim();
        if m.is_empty() || m.chars().count() > MAX_MODEL_NAME || m.contains(char::is_control) {
            continue;
        }
        if !out.iter().any(|x| x == m) {
            out.push(m.to_owned());
        }
        if out.len() >= MAX_MODELS {
            break;
        }
    }
    out
}

fn clean_key(key: &str) -> ApiResult<String> {
    let key = key.trim();
    if key.chars().count() > MAX_KEY || key.contains(char::is_control) {
        return Err(ApiError::bad_request(
            "That API key has characters a key can't contain. Paste it again without line breaks.",
        ));
    }
    Ok(key.to_owned())
}

fn clean_header_name(name: &str) -> ApiResult<String> {
    let name = name.trim();
    let valid = name.chars().count() <= MAX_HEADER_NAME
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(ApiError::bad_request(
            "The key header may only contain letters, digits, '-' and '_'.",
        ));
    }
    Ok(name.to_owned())
}

fn new_id() -> String {
    let mut b = [0u8; 4];
    getrandom::fill(&mut b).expect("OS random source unavailable");
    format!(
        "p{}",
        b.iter().map(|x| format!("{x:02x}")).collect::<String>()
    )
}

/// Validates a Settings-screen form and merges it over the stored provider (if any): the same
/// rules for saving a provider and for testing one that isn't saved yet.
pub fn draft_provider(stored: Option<&Provider>, input: &ProviderInput) -> ApiResult<Provider> {
    let name = input.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(ApiError::bad_request(
            "Give the provider a name (up to 60 characters).",
        ));
    }
    let base_url = normalize_base_url(&input.base_url).map_err(ApiError::bad_request)?;
    let api_key_header = clean_header_name(&input.api_key_header)?;
    let default_model = input.default_model.trim().to_owned();
    if default_model.chars().count() > MAX_MODEL_NAME || default_model.contains(char::is_control) {
        return Err(ApiError::bad_request("That model name isn't valid."));
    }
    let api_key = match input.api_key.as_deref().map(clean_key).transpose()? {
        Some(k) if !k.is_empty() => k,
        _ if input.clear_key => String::new(),
        _ => stored.map(|p| p.api_key.clone()).unwrap_or_default(),
    };
    Ok(Provider {
        id: stored.map_or_else(new_id, |p| p.id.clone()),
        name,
        kind: input.kind,
        base_url,
        api_key,
        api_key_header,
        models: clean_models(&input.models),
        default_model,
    })
}

pub struct AiStore {
    path: Option<PathBuf>,
    inner: RwLock<AiSettings>,
}

impl AiStore {
    /// A missing or corrupt file means "nothing configured", never a startup failure.
    pub fn load(path: Option<PathBuf>) -> Self {
        let settings = path
            .as_deref()
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            path,
            inner: RwLock::new(settings),
        }
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        Self::load(None)
    }

    pub fn snapshot(&self) -> AiSettings {
        self.inner.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Applies `edit` to a copy, saves the copy, and only then makes it current, so a failed
    /// write leaves memory and disk agreeing on the old settings.
    fn update<T>(
        &self,
        edit: impl FnOnce(&mut AiSettings) -> ApiResult<T>,
    ) -> ApiResult<(T, AiSettings)> {
        let mut guard = self.inner.write().unwrap_or_else(|e| e.into_inner());
        let mut next = guard.clone();
        let out = edit(&mut next)?;
        if let Some(path) = &self.path {
            save(path, &next)?;
        }
        *guard = next.clone();
        Ok((out, next))
    }

    pub fn upsert_provider(&self, input: ProviderInput) -> ApiResult<(Provider, AiSettings)> {
        let (provider, settings) = self.update(|s| {
            let index = match input.id.as_deref().filter(|id| !id.is_empty()) {
                Some(id) => Some(
                    s.providers
                        .iter()
                        .position(|p| p.id == id)
                        .ok_or_else(|| ApiError::not_found("That provider no longer exists."))?,
                ),
                None => None,
            };
            if index.is_none() && s.providers.len() >= MAX_PROVIDERS {
                return Err(ApiError::bad_request(format!(
                    "You can keep up to {MAX_PROVIDERS} providers. Remove one first."
                )));
            }
            let provider = draft_provider(index.map(|i| &s.providers[i]), &input)?;
            match index {
                Some(i) => s.providers[i] = provider.clone(),
                None => s.providers.push(provider.clone()),
            }
            // The first provider becomes the active one, so chat works right after adding it.
            if s.active_provider_id.is_none() {
                s.active_provider_id = Some(provider.id.clone());
            }
            Ok(provider)
        })?;
        Ok((provider, settings))
    }

    pub fn remove_provider(&self, id: &str) -> ApiResult<AiSettings> {
        let (_, settings) = self.update(|s| {
            let before = s.providers.len();
            s.providers.retain(|p| p.id != id);
            if s.providers.len() == before {
                return Err(ApiError::not_found("That provider no longer exists."));
            }
            if s.active_provider_id.as_deref() == Some(id) {
                s.active_provider_id = s.providers.first().map(|p| p.id.clone());
                s.active_model = None;
            }
            Ok(())
        })?;
        Ok(settings)
    }

    /// Sets the active provider/model and the custom instructions; absent fields are untouched.
    pub fn set_preferences(&self, patch: &Value) -> ApiResult<AiSettings> {
        let (_, settings) = self.update(|s| {
            if let Some(v) = patch.get("activeProviderId") {
                match v.as_str() {
                    Some(id) if s.provider(id).is_some() => {
                        if s.active_provider_id.as_deref() != Some(id) {
                            s.active_model = None;
                        }
                        s.active_provider_id = Some(id.to_owned());
                    }
                    Some(_) => return Err(ApiError::not_found("That provider no longer exists.")),
                    None => s.active_provider_id = None,
                }
            }
            if let Some(v) = patch.get("activeModel") {
                s.active_model = v
                    .as_str()
                    .map(str::trim)
                    .filter(|m| !m.is_empty() && m.chars().count() <= MAX_MODEL_NAME)
                    .map(str::to_owned);
            }
            if let Some(v) = patch.get("customInstructions").and_then(Value::as_str) {
                s.custom_instructions = v.chars().take(MAX_INSTRUCTIONS).collect();
            }
            Ok(())
        })?;
        Ok(settings)
    }
}

fn save(path: &Path, settings: &AiSettings) -> ApiResult<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(settings).map_err(ApiError::internal)?;
    {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600); // owner-only, set at creation so the key is never world-readable
        }
        let mut file = opts.open(&tmp)?;
        file.write_all(&bytes)?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str, key: Option<&str>) -> ProviderInput {
        ProviderInput {
            name: name.into(),
            base_url: "https://api.openai.com/v1/".into(),
            api_key: key.map(str::to_owned),
            models: vec![
                "gpt-4.1".into(),
                " gpt-4.1 ".into(),
                "".into(),
                "o4-mini".into(),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn base_urls_are_validated_and_normalised() {
        assert_eq!(
            normalize_base_url(" https://api.openai.com/v1/ ").unwrap(),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_base_url("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1"
        );
        // Azure keeps its api-version query.
        assert_eq!(
            normalize_base_url(
                "https://x.openai.azure.com/openai/deployments/d/?api-version=2024-10-21#f"
            )
            .unwrap(),
            "https://x.openai.azure.com/openai/deployments/d?api-version=2024-10-21"
        );
        for bad in [
            "",
            "   ",
            "api.openai.com",
            "ftp://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://user:pass@example.com/v1",
            "https://",
        ] {
            assert!(
                normalize_base_url(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn the_public_view_never_contains_the_key() {
        let store = AiStore::in_memory();
        let (p, settings) = store
            .upsert_provider(input("OpenAI", Some("sk-secret-key-123456")))
            .unwrap();
        let public = settings.public().to_string();
        assert!(!public.contains("sk-secret"), "{public}");
        let view = p.public();
        assert_eq!(view["hasKey"], true);
        assert_eq!(view["keyHint"], "3456");
        assert_eq!(view["models"], json!(["gpt-4.1", "o4-mini"]));
        assert!(view.get("apiKey").is_none());
    }

    #[test]
    fn short_keys_get_no_hint() {
        let p = Provider {
            api_key: "short".into(),
            ..Default::default()
        };
        assert_eq!(p.public()["keyHint"], "");
        assert_eq!(p.public()["hasKey"], true);
    }

    #[test]
    fn editing_without_a_key_keeps_it_and_clear_removes_it() {
        let store = AiStore::in_memory();
        let (p, _) = store
            .upsert_provider(input("A", Some("sk-first-key-0000")))
            .unwrap();

        let mut edit = input("A renamed", None);
        edit.id = Some(p.id.clone());
        let (p2, _) = store.upsert_provider(edit).unwrap();
        assert_eq!(p2.api_key, "sk-first-key-0000");
        assert_eq!(p2.name, "A renamed");

        let mut replace = input("A", Some("sk-second-key-1111"));
        replace.id = Some(p.id.clone());
        assert_eq!(
            store.upsert_provider(replace).unwrap().0.api_key,
            "sk-second-key-1111"
        );

        let mut clear = input("A", None);
        clear.id = Some(p.id.clone());
        clear.clear_key = true;
        assert_eq!(store.upsert_provider(clear).unwrap().0.api_key, "");
        assert_eq!(store.snapshot().providers.len(), 1);
    }

    #[test]
    fn the_first_provider_becomes_active_and_removal_falls_back() {
        let store = AiStore::in_memory();
        let (a, s) = store.upsert_provider(input("A", None)).unwrap();
        assert_eq!(s.active_provider_id.as_deref(), Some(a.id.as_str()));
        let (b, s) = store.upsert_provider(input("B", None)).unwrap();
        assert_eq!(s.active_provider_id.as_deref(), Some(a.id.as_str()));

        store
            .set_preferences(&json!({ "activeProviderId": b.id, "activeModel": "o4-mini" }))
            .unwrap();
        // Switching provider forgets the old provider's model.
        let s = store
            .set_preferences(&json!({ "activeProviderId": a.id }))
            .unwrap();
        assert_eq!(s.active_model, None);

        store
            .set_preferences(&json!({ "activeProviderId": b.id, "activeModel": "o4-mini" }))
            .unwrap();
        let s = store.remove_provider(&b.id).unwrap();
        assert_eq!(s.active_provider_id.as_deref(), Some(a.id.as_str()));
        assert_eq!(s.active_model, None);
        assert!(store.remove_provider(&b.id).is_err());
    }

    #[test]
    fn invalid_input_is_rejected_and_nothing_is_stored() {
        let store = AiStore::in_memory();
        assert!(store.upsert_provider(input("  ", None)).is_err());
        let mut bad_url = input("A", None);
        bad_url.base_url = "nope".into();
        assert!(store.upsert_provider(bad_url).is_err());
        let mut bad_header = input("A", None);
        bad_header.api_key_header = "bad header\r\nx: y".into();
        assert!(store.upsert_provider(bad_header).is_err());
        let newline_key = input("A", Some("sk-abc\ndef"));
        assert!(store.upsert_provider(newline_key).is_err());
        let mut ghost = input("A", None);
        ghost.id = Some("pnope".into());
        assert!(store.upsert_provider(ghost).is_err());
        assert!(store.snapshot().providers.is_empty());
    }

    #[test]
    fn provider_count_is_capped() {
        let store = AiStore::in_memory();
        for i in 0..MAX_PROVIDERS {
            store
                .upsert_provider(input(&format!("p{i}"), None))
                .unwrap();
        }
        assert!(store.upsert_provider(input("one too many", None)).is_err());
    }

    #[test]
    fn resolve_prefers_explicit_then_saved_then_first() {
        let store = AiStore::in_memory();
        let mut a = input("A", None);
        a.default_model = "a-default".into();
        let (a, _) = store.upsert_provider(a).unwrap();
        let mut b = input("B", None);
        b.models = vec!["b-one".into()];
        let (b, _) = store.upsert_provider(b).unwrap();

        let s = store.snapshot();
        assert_eq!(s.resolve(None, None).unwrap().1, "a-default");
        assert_eq!(s.resolve(Some(&b.id), None).unwrap().1, "b-one");
        assert_eq!(s.resolve(Some(&b.id), Some("custom")).unwrap().1, "custom");
        assert_eq!(s.resolve(Some("unknown"), None).unwrap().0.id, a.id);

        let s = store
            .set_preferences(&json!({ "activeProviderId": b.id, "activeModel": "b-saved" }))
            .unwrap();
        assert_eq!(s.resolve(None, None).unwrap().1, "b-saved");
        // A saved model belongs to the saved provider only.
        assert_eq!(s.resolve(Some(&a.id), None).unwrap().1, "a-default");

        assert!(AiStore::in_memory().snapshot().resolve(None, None).is_err());
        let mut no_model = input("C", None);
        no_model.models.clear();
        let only = AiStore::in_memory();
        only.upsert_provider(no_model).unwrap();
        assert!(only.snapshot().resolve(None, None).is_err());
    }

    #[test]
    fn persists_atomically_with_owner_only_permissions_and_survives_a_corrupt_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/ai.json");
        let store = AiStore::load(Some(path.clone()));
        store
            .upsert_provider(input("A", Some("sk-persisted-key-9999")))
            .unwrap();

        let reloaded = AiStore::load(Some(path.clone()));
        assert_eq!(reloaded.snapshot(), store.snapshot());
        assert_eq!(
            reloaded.snapshot().providers[0].api_key,
            "sk-persisted-key-9999"
        );
        assert!(!path.with_extension("json.tmp").exists());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }

        fs::write(&path, "{ not json").unwrap();
        assert!(AiStore::load(Some(path)).snapshot().providers.is_empty());
    }

    #[test]
    fn a_failed_save_leaves_the_settings_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        // The "file" is a directory, so the final rename fails.
        let path = dir.path().join("ai.json");
        fs::create_dir(&path).unwrap();
        let store = AiStore::load(Some(path));
        assert!(store.upsert_provider(input("A", None)).is_err());
        assert!(store.snapshot().providers.is_empty());
    }
}
