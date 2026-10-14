//! Chat history, stored inside the project (`.somescript/chat/`) so it follows the project
//! folder and never mixes with another project's conversations. Same two-part layout as the
//! cloud editor's thread store (`apps/editor/lib/eve-threads-storage.ts`): a small index the
//! history menu reads, and one file per conversation.
//!
//! The conversation itself is opaque to the server: the UI owns the message shape and the
//! agent rebuilds model history from it (`agent::history_from_client`).

use crate::{
    error::{ApiError, ApiResult},
    storage::Project,
};
use serde_json::{Map, Value, json};
use std::time::SystemTime;

const DIR: &str = ".somescript/chat";
const INDEX_PATH: &str = ".somescript/chat/index.json";
const MAX_THREADS: usize = 200;
const MAX_TITLE: usize = 200;
const MAX_MESSAGES: usize = 2000;
/// A saved conversation can carry file diffs; this keeps one runaway chat from filling the disk.
pub const MAX_SNAPSHOT_BYTES: usize = 24 * 1024 * 1024;
pub const SNAPSHOT_VERSION: u64 = 1;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Ids become file names, so they are restricted to what a UUID or a counter looks like.
pub fn valid_thread_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn thread_path(id: &str) -> String {
    format!("{DIR}/threads/{id}.json")
}

fn require_id(id: &str) -> ApiResult<()> {
    if valid_thread_id(id) {
        Ok(())
    } else {
        Err(ApiError::bad_request("Invalid threadId"))
    }
}

/// Coerces untrusted JSON (a request body, or a hand-edited file) into `{threads, activeThreadId}`.
pub fn sanitize_index(input: &Value) -> Value {
    let empty = json!({ "threads": [], "activeThreadId": "" });
    let Some(entries) = input.get("threads").and_then(Value::as_array) else {
        return empty;
    };
    let mut threads: Vec<Value> = Vec::new();
    for entry in entries {
        let (Some(id), Some(title)) = (
            entry.get("id").and_then(Value::as_str),
            entry.get("title").and_then(Value::as_str),
        ) else {
            continue;
        };
        if !valid_thread_id(id) || threads.iter().any(|t| t["id"] == id) {
            continue;
        }
        threads.push(json!({
            "id": id,
            "title": title.chars().take(MAX_TITLE).collect::<String>(),
            "createdAt": entry
                .get("createdAt")
                .filter(|v| v.is_number())
                .cloned()
                .unwrap_or_else(|| json!(now_ms())),
        }));
        if threads.len() >= MAX_THREADS {
            break;
        }
    }
    let active = input
        .get("activeThreadId")
        .and_then(Value::as_str)
        .filter(|id| threads.iter().any(|t| t["id"] == *id))
        .unwrap_or("")
        .to_owned();
    json!({ "threads": threads, "activeThreadId": active })
}

pub fn read_index(project: &Project) -> Value {
    project
        .read_text(INDEX_PATH)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .map(|v| sanitize_index(&v))
        .unwrap_or_else(|| sanitize_index(&Value::Null))
}

pub fn write_index(project: &Project, index: &Value) -> ApiResult<()> {
    let clean = sanitize_index(index);
    project.write(
        INDEX_PATH,
        &serde_json::to_vec(&clean).map_err(ApiError::internal)?,
    )
}

/// `Some({version, messages})`, or `None` when there is nothing (readable) saved.
pub fn read_snapshot(project: &Project, id: &str) -> ApiResult<Option<Value>> {
    require_id(id)?;
    let Ok(text) = project.read_text(&thread_path(id)) else {
        return Ok(None);
    };
    let Ok(v) = serde_json::from_str::<Value>(&text) else {
        return Ok(None);
    };
    Ok(
        (v.get("version").and_then(Value::as_u64) == Some(SNAPSHOT_VERSION)
            && v.get("messages").is_some_and(Value::is_array))
        .then_some(v),
    )
}

pub fn write_snapshot(project: &Project, id: &str, messages: &Value) -> ApiResult<()> {
    require_id(id)?;
    let Some(list) = messages.as_array() else {
        return Err(ApiError::bad_request("Malformed thread snapshot"));
    };
    let list: Vec<&Value> = list.iter().rev().take(MAX_MESSAGES).rev().collect();
    let mut snapshot = Map::new();
    snapshot.insert("version".into(), json!(SNAPSHOT_VERSION));
    snapshot.insert("messages".into(), json!(list));
    let bytes = serde_json::to_vec(&Value::Object(snapshot)).map_err(ApiError::internal)?;
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(ApiError::new(
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            "This conversation is too large to save. Start a new chat.",
        ));
    }
    project.write(&thread_path(id), &bytes)
}

pub fn delete_snapshot(project: &Project, id: &str) -> ApiResult<()> {
    require_id(id)?;
    project.delete_path(&thread_path(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, Project) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        std::fs::create_dir(&root).unwrap();
        (dir, Project::open(root).unwrap())
    }

    #[test]
    fn thread_ids_must_be_safe_file_names() {
        for ok in ["a", "550e8400-e29b-41d4-a716-446655440000", "t_1"] {
            assert!(valid_thread_id(ok), "{ok}");
        }
        for bad in ["", "../x", "a/b", "a.json", "a b", &"x".repeat(81), "tab\t"] {
            assert!(!valid_thread_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn the_index_is_sanitised_like_the_cloud_editors() {
        let clean = sanitize_index(&json!({
            "threads": [
                { "id": "a", "title": "First", "createdAt": 5 },
                { "id": "a", "title": "duplicate id" },
                { "id": "../evil", "title": "bad id" },
                { "id": "b", "title": "x".repeat(300) },
                { "id": 7, "title": "numeric id" },
                "junk",
            ],
            "activeThreadId": "b",
        }));
        let ids: Vec<_> = clean["threads"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(clean["threads"][0]["createdAt"], 5);
        assert!(clean["threads"][1]["createdAt"].is_number());
        assert_eq!(
            clean["threads"][1]["title"]
                .as_str()
                .unwrap()
                .chars()
                .count(),
            MAX_TITLE
        );
        assert_eq!(clean["activeThreadId"], "b");

        // An active id that isn't in the list is dropped.
        let dangling = sanitize_index(
            &json!({ "threads": [{ "id": "a", "title": "t" }], "activeThreadId": "zzz" }),
        );
        assert_eq!(dangling["activeThreadId"], "");
        assert_eq!(
            sanitize_index(&json!("nope")),
            json!({ "threads": [], "activeThreadId": "" })
        );
    }

    #[test]
    fn index_and_snapshots_round_trip_inside_the_project() {
        let (_d, p) = project();
        assert_eq!(
            read_index(&p),
            json!({ "threads": [], "activeThreadId": "" })
        );
        write_index(&p, &json!({ "threads": [{ "id": "t1", "title": "Hello", "createdAt": 1 }], "activeThreadId": "t1" })).unwrap();
        assert_eq!(read_index(&p)["threads"][0]["title"], "Hello");

        assert_eq!(read_snapshot(&p, "t1").unwrap(), None);
        let messages = json!([{ "role": "user", "text": "hi" }, { "role": "assistant", "parts": [{ "type": "text", "text": "hello" }] }]);
        write_snapshot(&p, "t1", &messages).unwrap();
        let snap = read_snapshot(&p, "t1").unwrap().unwrap();
        assert_eq!(snap["messages"], messages);
        assert_eq!(snap["version"], SNAPSHOT_VERSION);
        assert!(p.root().join(".somescript/chat/threads/t1.json").is_file());

        delete_snapshot(&p, "t1").unwrap();
        assert_eq!(read_snapshot(&p, "t1").unwrap(), None);
        delete_snapshot(&p, "t1").unwrap(); // deleting twice is fine
    }

    #[test]
    fn bad_ids_corrupt_files_wrong_versions_and_oversize_conversations_are_handled() {
        let (_d, p) = project();
        assert!(read_snapshot(&p, "../x").is_err());
        assert!(write_snapshot(&p, "a/b", &json!([])).is_err());
        assert!(write_snapshot(&p, "t", &json!({ "not": "a list" })).is_err());

        p.write(".somescript/chat/threads/t.json", b"{ not json")
            .unwrap();
        assert_eq!(read_snapshot(&p, "t").unwrap(), None);
        p.write(
            ".somescript/chat/threads/old.json",
            br#"{"version":99,"messages":[]}"#,
        )
        .unwrap();
        assert_eq!(read_snapshot(&p, "old").unwrap(), None);

        let big = json!([{ "role": "user", "text": "x".repeat(MAX_SNAPSHOT_BYTES + 1) }]);
        let err = write_snapshot(&p, "huge", &big).unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::PAYLOAD_TOO_LARGE);
        assert!(!p.root().join(".somescript/chat/threads/huge.json").exists());
    }

    #[test]
    fn only_the_newest_messages_are_kept_when_a_chat_gets_very_long() {
        let (_d, p) = project();
        let many: Vec<Value> = (0..MAX_MESSAGES + 5)
            .map(|i| json!({ "role": "user", "text": i.to_string() }))
            .collect();
        write_snapshot(&p, "long", &json!(many)).unwrap();
        let snap = read_snapshot(&p, "long").unwrap().unwrap();
        let kept = snap["messages"].as_array().unwrap();
        assert_eq!(kept.len(), MAX_MESSAGES);
        assert_eq!(kept.last().unwrap()["text"], (MAX_MESSAGES + 4).to_string());
    }
}
