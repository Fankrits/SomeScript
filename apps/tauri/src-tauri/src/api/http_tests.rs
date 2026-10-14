//! Drives the real router the way the editor UI does, checking status codes, headers and
//! JSON shapes: those are the contract with apps/editor, so they are what must not drift.

use super::{ApiState, router};
use crate::{library::Library, tex::TexTools};
use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

struct Harness {
    app: Router,
    root: tempfile::TempDir,
}

/// The router's state with no real Tectonic and in-memory AI settings.
fn test_state(library: Arc<Library>, config_path: Option<std::path::PathBuf>) -> ApiState {
    ApiState {
        library,
        tex: Arc::new(TexTools::new("never-run".into(), "never-run".into())),
        templates_dir: std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("templates"),
        config_path,
        default_library: std::env::temp_dir().join("SomeScript-default-for-tests"),
        alternatives: Vec::new(),
        log_dir: None,
        webview_version: Some("test-webview 1.0".into()),
        ai: Arc::new(crate::ai::settings::AiStore::in_memory()),
        http: crate::ai::AiHttp::new(),
    }
}

fn harness() -> Harness {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("p1")).unwrap();
    let state = test_state(Arc::new(Library::new(root.path().to_path_buf())), None);
    Harness {
        app: router::<ApiState>().with_state(state),
        root,
    }
}

struct Reply {
    status: StatusCode,
    headers: axum::http::HeaderMap,
    body: Vec<u8>,
}

impl Reply {
    fn json(&self) -> Value {
        serde_json::from_slice(&self.body)
            .unwrap_or_else(|e| panic!("not JSON ({e}): {}", String::from_utf8_lossy(&self.body)))
    }
}

impl Harness {
    async fn send(&self, req: Request<Body>) -> Reply {
        let resp = self.app.clone().oneshot(req).await.unwrap();
        let (parts, body) = resp.into_parts();
        Reply {
            status: parts.status,
            headers: parts.headers,
            body: body.collect().await.unwrap().to_bytes().to_vec(),
        }
    }
    async fn get(&self, uri: &str) -> Reply {
        self.send(Request::get(uri).body(Body::empty()).unwrap())
            .await
    }
    async fn json(&self, method: Method, uri: &str, body: Value) -> Reply {
        let req = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        self.send(req).await
    }
    async fn post(&self, uri: &str, body: Value) -> Reply {
        self.json(Method::POST, uri, body).await
    }
    fn file(&self, rel: &str) -> std::path::PathBuf {
        self.root.path().join("p1").join(rel)
    }
}

#[tokio::test]
async fn errors_use_the_cloud_editors_wire_format() {
    let h = harness();
    let r = h.get("/api/files").await;
    assert_eq!(
        (r.status, r.json()),
        (
            StatusCode::BAD_REQUEST,
            json!({ "error": "Invalid projectId" })
        )
    );
    let r = h.get("/api/files?projectId=..").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = h.get("/api/files?projectId=nope").await;
    assert_eq!(
        (r.status, r.json()),
        (
            StatusCode::NOT_FOUND,
            json!({ "error": "Project not found" })
        )
    );
    let r = h.get("/api/files?projectId=p1&path=missing.tex").await;
    assert_eq!(
        (r.status, r.json()),
        (StatusCode::NOT_FOUND, json!({ "error": "File not found" }))
    );
}

#[tokio::test]
async fn path_traversal_is_refused_on_every_file_action() {
    let h = harness();
    std::fs::write(h.root.path().join("secret.txt"), "top secret").unwrap();
    let r = h.get("/api/files?projectId=p1&path=../secret.txt").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    for body in [
        json!({ "projectId": "p1", "action": "save", "path": "../evil.tex", "content": "x" }),
        json!({ "projectId": "p1", "action": "create", "path": "../evil.tex" }),
        json!({ "projectId": "p1", "action": "delete", "path": "../secret.txt" }),
        json!({ "projectId": "p1", "action": "move", "oldPath": "../secret.txt", "newPath": "a.txt" }),
        json!({ "projectId": "p1", "action": "copy", "path": "../secret.txt", "newPath": "a.txt" }),
        json!({ "projectId": "p1", "action": "delete", "path": "" }),
    ] {
        let r = h.post("/api/files", body.clone()).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{body}");
    }
    assert!(h.root.path().join("secret.txt").exists());
    assert!(!h.root.path().join("evil.tex").exists());
}

#[tokio::test]
async fn file_lifecycle_matches_the_editor_contract() {
    let h = harness();
    let ok = json!({ "success": true });

    let r = h
        .post(
            "/api/files",
            json!({ "projectId": "p1", "action": "create", "path": "main.tex" }),
        )
        .await;
    assert_eq!((r.status, r.json()), (StatusCode::OK, ok.clone()));
    let r = h
        .post(
            "/api/files",
            json!({ "projectId": "p1", "action": "create", "path": "figs", "isDir": true }),
        )
        .await;
    assert_eq!(r.json(), ok);
    let r = h
        .post(
            "/api/files",
            json!({ "projectId": "p1", "action": "save", "path": "main.tex", "content": "สวัสดี \\LaTeX" }),
        )
        .await;
    assert_eq!(r.json(), ok);

    let r = h.get("/api/files?projectId=p1").await;
    assert_eq!(
        r.json(),
        json!({ "tree": [
            { "name": "figs", "path": "figs", "isDir": true, "children": [] },
            { "name": "main.tex", "path": "main.tex", "isDir": false },
        ]})
    );
    let r = h.get("/api/files?projectId=p1&path=main.tex").await;
    assert_eq!(r.json(), json!({ "content": "สวัสดี \\LaTeX" }));

    let r = h.post("/api/files", json!({ "projectId": "p1", "action": "move", "oldPath": "main.tex", "newPath": "figs/m.tex" })).await;
    assert_eq!(r.json(), ok);
    let r = h.post("/api/files", json!({ "projectId": "p1", "action": "copy", "path": "figs/m.tex", "newPath": "copy.tex" })).await;
    assert_eq!(r.json(), ok);
    assert_eq!(
        std::fs::read_to_string(h.file("copy.tex")).unwrap(),
        "สวัสดี \\LaTeX"
    );
    let r = h
        .post(
            "/api/files",
            json!({ "projectId": "p1", "action": "delete", "path": "figs" }),
        )
        .await;
    assert_eq!(r.json(), ok);
    assert!(!h.file("figs").exists());

    // Validation messages the UI shows.
    for (body, msg) in [
        (
            json!({ "projectId": "p1", "action": "save", "path": "a.tex" }),
            "Missing path or content",
        ),
        (
            json!({ "projectId": "p1", "action": "copy", "path": "a.tex" }),
            "Missing path or newPath",
        ),
        (
            json!({ "projectId": "p1", "action": "explode" }),
            "Invalid action",
        ),
    ] {
        let r = h.post("/api/files", body).await;
        assert_eq!(
            (r.status, r.json()),
            (StatusCode::BAD_REQUEST, json!({ "error": msg }))
        );
    }
}

#[tokio::test]
async fn binary_pdf_image_and_download_responses() {
    let h = harness();
    std::fs::write(h.file("main.tex"), "x").unwrap();
    std::fs::write(h.file("fig.pdf"), b"%PDF-1.5\nbody").unwrap();
    std::fs::write(h.file("pic.PNG"), [0x89, b'P', b'N', b'G', 0, 1]).unwrap();
    std::fs::write(h.file("data.bin"), [1u8, 0, 2]).unwrap();
    std::fs::create_dir_all(h.file(".preview-cache")).unwrap();
    std::fs::write(h.file(".preview-cache/main.pdf"), b"%PDF-1.5").unwrap();

    let r = h
        .get("/api/files?projectId=p1&path=.preview-cache/main.pdf")
        .await;
    assert_eq!(r.headers[header::CONTENT_TYPE], "application/pdf");
    assert_eq!(r.headers[header::ACCEPT_RANGES], "bytes");
    assert_eq!(r.body, b"%PDF-1.5");

    let r = h.get("/api/files?projectId=p1&path=pic.PNG").await;
    assert_eq!(r.headers[header::CONTENT_TYPE], "image/png");
    assert_eq!(r.headers[header::CACHE_CONTROL], "no-store");

    let r = h.get("/api/files?projectId=p1&path=data.bin").await;
    assert_eq!(r.json(), json!({ "unsupported": true }));

    let r = h
        .get("/api/files?projectId=p1&path=fig.pdf&download=1")
        .await;
    assert_eq!(r.headers[header::CONTENT_TYPE], "application/pdf");
    assert!(
        r.headers[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .starts_with("attachment; filename=\"fig.pdf\"")
    );
    let r = h
        .get("/api/files?projectId=p1&path=data.bin&download=1")
        .await;
    assert_eq!(r.headers[header::CONTENT_TYPE], "application/octet-stream");

    // The compiled PDF beside main.tex is hidden from the tree, the figure PDF is not.
    let tree = h.get("/api/files?projectId=p1").await.json();
    let names: Vec<_> = tree["tree"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["data.bin", "fig.pdf", "main.tex", "pic.PNG"]);
}

fn multipart(parts: &[(&str, Option<&str>, &[u8])]) -> Request<Body> {
    let boundary = "XBOUNDARYX";
    let mut body = Vec::new();
    for (name, filename, data) in parts {
        body.extend(format!("--{boundary}\r\n").bytes());
        match filename {
            Some(f) => body.extend(
                format!("Content-Disposition: form-data; name=\"{name}\"; filename=\"{f}\"\r\nContent-Type: application/octet-stream\r\n\r\n").bytes(),
            ),
            None => body.extend(format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").bytes()),
        }
        body.extend(*data);
        body.extend(b"\r\n");
    }
    body.extend(format!("--{boundary}--\r\n").bytes());
    Request::post("/api/files/upload")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap()
}

#[tokio::test]
async fn upload_dedupes_names_and_never_overwrites() {
    let h = harness();
    std::fs::write(h.file("logo.png"), "original").unwrap();
    // `files` before `projectId` on purpose: field order is up to the client.
    let r = h
        .send(multipart(&[
            ("files", Some("logo.png"), b"new"),
            ("files", Some("notes.txt"), b"hi"),
            ("projectId", None, b"p1"),
            ("path", None, b"assets"),
        ]))
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(
        r.json(),
        json!({ "success": true, "saved": ["assets/logo.png", "assets/notes.txt"] })
    );
    assert_eq!(
        std::fs::read_to_string(h.file("logo.png")).unwrap(),
        "original"
    );

    let r = h
        .send(multipart(&[
            ("projectId", None, b"p1"),
            ("path", None, b""),
            ("files", Some("logo.png"), b"v2"),
        ]))
        .await;
    assert_eq!(r.json()["saved"], json!(["logo-1.png"]));

    let r = h.send(multipart(&[("projectId", None, b"p1")])).await;
    assert_eq!(
        (r.status, r.json()),
        (
            StatusCode::BAD_REQUEST,
            json!({ "error": "No files provided" })
        )
    );
}

#[tokio::test]
async fn search_returns_ordered_results_by_file_and_utf16_offsets() {
    let h = harness();
    std::fs::write(h.file("b.tex"), "สวัสดี hello\nnothing\nhello hello").unwrap();
    std::fs::create_dir(h.file("a")).unwrap();
    std::fs::write(h.file("a/c.tex"), "Hello").unwrap();

    let r = h.get("/api/search?projectId=p1&query=hello").await.json();
    let results = r["results"].as_array().unwrap();
    assert_eq!(results.len(), 4);
    assert_eq!(results[0]["fileId"], "a/c.tex"); // directories come first in the tree
    assert_eq!(
        results[1],
        json!({ "fileId": "b.tex", "fileName": "b.tex", "line": 1, "text": "สวัสดี hello", "matchIndex": 7 })
    );
    let keys: Vec<_> = r["resultsByFile"].as_object().unwrap().keys().collect();
    assert_eq!(keys, ["a/c.tex", "b.tex"]); // insertion order, not alphabetical re-sorting
    assert_eq!(
        r["resultsByFile"]["b.tex"]["matches"]
            .as_array()
            .unwrap()
            .len(),
        3
    );

    let r = h.get("/api/search?projectId=p1&query=").await.json();
    assert_eq!(r, json!({ "results": [], "resultsByFile": {} }));
    let r = h
        .get("/api/search?projectId=p1&query=(&useRegex=true")
        .await;
    assert_eq!(
        (r.status, r.json()),
        (
            StatusCode::BAD_REQUEST,
            json!({ "error": "Invalid regular expression" })
        )
    );
    let r = h
        .get("/api/search?projectId=p1&query=hello&matchCase=true")
        .await
        .json();
    assert_eq!(r["results"].as_array().unwrap().len(), 3); // "Hello" in c.tex no longer matches
}

#[tokio::test]
async fn replace_one_all_and_stale_results() {
    let h = harness();
    std::fs::write(h.file("a.tex"), "cat cat\ndog cat").unwrap();
    std::fs::write(h.file("b.tex"), "cat").unwrap();
    let base = json!({ "projectId": "p1", "query": "cat", "replaceText": "fox", "scope": "all" });
    let with = |extra: Value| {
        let mut b = base.clone();
        b.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        b
    };

    // Replace the second "cat" on line 1 only.
    let one = with(
        json!({ "target": { "fileId": "a.tex", "line": 1, "matchIndex": 4, "lineText": "cat cat" } }),
    );
    let r = h.post("/api/search", one.clone()).await;
    assert_eq!(
        r.json(),
        json!({ "success": true, "count": 1, "modifiedFiles": ["a.tex"] })
    );
    assert_eq!(
        std::fs::read_to_string(h.file("a.tex")).unwrap(),
        "cat fox\ndog cat"
    );

    // Same target again: the line changed underneath, so it is stale (409), not a silent edit.
    let r = h.post("/api/search", one).await;
    assert_eq!(
        (r.status, r.json()),
        (
            StatusCode::CONFLICT,
            json!({ "error": "Search result is stale; refresh the search" })
        )
    );

    let bad = with(
        json!({ "target": { "fileId": "a.png", "line": 1, "matchIndex": 0, "lineText": "x" } }),
    );
    assert_eq!(
        h.post("/api/search", bad).await.status,
        StatusCode::BAD_REQUEST
    );
    let gone = with(
        json!({ "target": { "fileId": "nope.tex", "line": 1, "matchIndex": 0, "lineText": "x" } }),
    );
    assert_eq!(
        h.post("/api/search", gone).await.status,
        StatusCode::NOT_FOUND
    );

    // Replace-all limited to line 2 of the current file.
    let ranged =
        with(json!({ "scope": "current", "selectedPath": "a.tex", "startLine": 2, "endLine": 2 }));
    let r = h.post("/api/search", ranged).await.json();
    assert_eq!(
        r,
        json!({ "success": true, "count": 1, "modifiedFiles": ["a.tex"] })
    );
    assert_eq!(
        std::fs::read_to_string(h.file("a.tex")).unwrap(),
        "cat fox\ndog fox"
    );

    let r = h.post("/api/search", base.clone()).await.json();
    assert_eq!(r["count"], 2);
    assert_eq!(std::fs::read_to_string(h.file("b.tex")).unwrap(), "fox");

    for (extra, msg) in [
        (json!({ "scope": "weird" }), "Invalid search scope"),
        (json!({ "startLine": 0 }), "Invalid line range"),
        (json!({ "query": "" }), "Missing query"),
    ] {
        let r = h.post("/api/search", with(extra)).await;
        assert_eq!(
            (r.status, r.json()),
            (StatusCode::BAD_REQUEST, json!({ "error": msg }))
        );
    }
}

#[tokio::test]
async fn tasks_settings_prefs_and_name_roundtrip() {
    let h = harness();

    assert_eq!(
        h.get("/api/tasks?projectId=p1").await.json(),
        json!({ "tasks": [] })
    );
    let r = h.post("/api/tasks", json!({ "projectId": "p1", "tasks": [{ "id": "1", "name": "write", "done": true, "createdAt": 7 }, "junk"] })).await;
    assert_eq!(r.json(), json!({ "success": true }));
    let tasks = h.get("/api/tasks?projectId=p1").await.json();
    assert_eq!(
        tasks["tasks"],
        json!([{ "id": "1", "name": "write", "done": true, "status": "finished", "createdAt": 7 }])
    );
    let r = h.post("/api/tasks", json!({ "projectId": "p1" })).await;
    assert_eq!(
        (r.status, r.json()),
        (StatusCode::BAD_REQUEST, json!({ "error": "Missing tasks" }))
    );

    assert_eq!(
        h.get("/api/project-settings?projectId=p1").await.json(),
        json!({ "settings": { "mainFilePath": "main.tex", "compilerEngine": "tectonic" } })
    );
    let r = h
        .post(
            "/api/project-settings",
            json!({ "projectId": "p1", "settings": { "mainFilePath": "thesis.tex" } }),
        )
        .await;
    assert_eq!(r.json()["settings"]["mainFilePath"], "thesis.tex");
    assert_eq!(
        h.get("/api/project-settings?projectId=p1").await.json()["settings"]["mainFilePath"],
        "thesis.tex"
    );

    let prefs = h.get("/api/editor-prefs?projectId=p1").await.json();
    assert_eq!(prefs["prefs"]["autoCompileEnabled"], true);
    // Two independent writers each send only their own field; neither clobbers the other.
    h.json(
        Method::PUT,
        "/api/editor-prefs",
        json!({ "projectId": "p1", "prefs": { "vimModeEnabled": true } }),
    )
    .await;
    let r = h
        .json(
            Method::PUT,
            "/api/editor-prefs",
            json!({ "projectId": "p1", "prefs": { "lastOpenFile": "a.tex" } }),
        )
        .await
        .json();
    assert_eq!(
        (
            r["prefs"]["vimModeEnabled"].clone(),
            r["prefs"]["lastOpenFile"].clone()
        ),
        (json!(true), json!("a.tex"))
    );
    assert!(h.file(".somescript/editor-prefs/local.json").exists());

    assert_eq!(
        h.get("/api/project/name?projectId=p1").await.json(),
        json!({ "name": "p1" })
    );
    assert_eq!(
        h.get("/api/project/name?projectId=nope").await.status,
        StatusCode::NOT_FOUND
    );

    // Metadata files stay out of the file tree.
    assert_eq!(
        h.get("/api/files?projectId=p1").await.json(),
        json!({ "tree": [] })
    );
}

// ---- Library screen ----------------------------------------------------------------------

fn multipart_to(uri: &str, parts: &[(&str, Option<&str>, &[u8])]) -> Request<Body> {
    let mut req = multipart(parts);
    *req.uri_mut() = uri.parse().unwrap();
    req
}

#[tokio::test]
async fn create_from_templates_and_reject_bad_requests_without_leaving_folders() {
    let h = harness();
    assert_eq!(
        h.get("/api/templates").await.json()["templates"][0]["id"],
        "starter"
    );

    let r = h
        .post(
            "/api/projects",
            json!({ "name": "My Thesis", "template": "starter" }),
        )
        .await;
    assert_eq!(
        (r.status, r.json()),
        (StatusCode::OK, json!({ "id": "My Thesis" }))
    );
    let tree = h.get("/api/files?projectId=My%20Thesis").await.json();
    let names: Vec<_> = tree["tree"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, ["Fonts", "main.tex"]);
    let main = h
        .get("/api/files?projectId=My%20Thesis&path=main.tex")
        .await
        .json();
    assert!(
        main["content"]
            .as_str()
            .unwrap()
            .contains("compiles your documents right on your computer")
    );
    assert!(!main["content"].as_str().unwrap().contains("in the cloud"));

    // A new project opens main.tex straight away rather than an empty editor.
    let prefs = h
        .get("/api/editor-prefs?projectId=My%20Thesis")
        .await
        .json();
    assert_eq!(prefs["prefs"]["lastOpenFile"], "main.tex");

    // Same name again is de-duplicated; blank template is minimal; default template is the starter.
    let r = h
        .post(
            "/api/projects",
            json!({ "name": "My Thesis", "template": "blank" }),
        )
        .await;
    assert_eq!(r.json(), json!({ "id": "My Thesis 2" }));
    let blank = h.get("/api/files?projectId=My%20Thesis%202").await.json();
    assert_eq!(blank["tree"].as_array().unwrap().len(), 1);
    let r = h.post("/api/projects", json!({ "name": "Default" })).await;
    assert_eq!(r.json(), json!({ "id": "Default" }));
    assert!(h.root.path().join("Default/Fonts").is_dir());

    for (body, status, msg) in [
        (
            json!({ "name": "  " }),
            StatusCode::BAD_REQUEST,
            "Project name is required",
        ),
        (
            json!({ "name": "X", "template": "../../etc" }),
            StatusCode::BAD_REQUEST,
            "Unknown template",
        ),
        (
            json!({ "name": "X", "template": "nope" }),
            StatusCode::BAD_REQUEST,
            "Unknown template",
        ),
    ] {
        let r = h.post("/api/projects", body).await;
        assert_eq!((r.status, r.json()), (status, json!({ "error": msg })));
    }
    assert!(
        !h.root.path().join("X").exists(),
        "a rejected create must not leave a folder"
    );
}

#[tokio::test]
async fn project_lifecycle_list_rename_trash_restore_purge() {
    let h = harness(); // starts with a project folder named "p1"
    let ids = |v: Value| -> Vec<String> {
        v["projects"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["id"].as_str().unwrap().to_owned())
            .collect()
    };
    h.post(
        "/api/projects",
        json!({ "name": "Paper", "template": "blank" }),
    )
    .await;
    let listed = h.get("/api/projects").await.json();
    assert_eq!(ids(listed.clone()).len(), 2);
    assert!(listed["projects"][0]["updatedAt"].as_u64().unwrap() > 0);

    let r = h
        .post(
            "/api/projects/rename",
            json!({ "id": "Paper", "name": "Final Paper" }),
        )
        .await;
    assert_eq!(r.json(), json!({ "id": "Final Paper" }));
    assert!(h.get("/api/files?projectId=Paper").await.status == StatusCode::NOT_FOUND);
    assert_eq!(
        h.get("/api/project/name?projectId=Final%20Paper")
            .await
            .json(),
        json!({ "name": "Final Paper" })
    );
    let r = h
        .post(
            "/api/projects/rename",
            json!({ "id": "Final Paper", "name": "" }),
        )
        .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);

    let r = h
        .post("/api/projects/delete", json!({ "id": "Final Paper" }))
        .await;
    assert_eq!(r.json(), json!({ "success": true }));
    assert_eq!(ids(h.get("/api/projects").await.json()), ["p1"]);
    let trash = h.get("/api/trash").await.json();
    assert_eq!(trash["items"][0]["name"], "Final Paper");
    let trash_id = trash["items"][0]["id"].as_str().unwrap().to_owned();

    let r = h
        .post("/api/trash/restore", json!({ "id": trash_id }))
        .await;
    assert_eq!(r.json(), json!({ "id": "Final Paper" }));
    assert!(h.file("../Final Paper/main.tex").exists());

    h.post("/api/projects/delete", json!({ "id": "Final Paper" }))
        .await;
    let trash_id = h.get("/api/trash").await.json()["items"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        h.post("/api/trash/purge", json!({ "id": trash_id }))
            .await
            .json(),
        json!({ "success": true })
    );
    assert_eq!(h.get("/api/trash").await.json(), json!({ "items": [] }));

    // Traversal through the trash endpoints is refused, and nothing outside is touched.
    let r = h.post("/api/trash/purge", json!({ "id": "../p1" })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(h.root.path().join("p1").is_dir());
}

#[tokio::test]
async fn zip_export_then_import_round_trips_over_http() {
    let h = harness();
    h.post(
        "/api/projects",
        json!({ "name": "Source", "template": "blank" }),
    )
    .await;
    std::fs::write(h.root.path().join("Source/notes.txt"), "สวัสดี").unwrap();

    let r = h.get("/api/projects/export?id=Source").await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.headers[header::CONTENT_TYPE], "application/zip");
    assert!(
        r.headers[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("filename=\"Source.zip\"")
    );
    let zip = r.body;

    // Name comes from the form field, or else from the uploaded file's name.
    let r = h
        .send(multipart_to(
            "/api/projects/import",
            &[("name", None, b"Copy"), ("file", Some("x.zip"), &zip)],
        ))
        .await;
    assert_eq!(r.json(), json!({ "id": "Copy" }));
    assert_eq!(
        std::fs::read_to_string(h.root.path().join("Copy/notes.txt")).unwrap(),
        "สวัสดี"
    );
    assert!(h.root.path().join("Copy/main.tex").exists());
    // The imported project opens its main file, not an empty editor.
    let prefs = h.get("/api/editor-prefs?projectId=Copy").await.json();
    assert_eq!(prefs["prefs"]["lastOpenFile"], "main.tex");
    let r = h
        .send(multipart_to(
            "/api/projects/import",
            &[("file", Some("Thesis Backup.zip"), &zip)],
        ))
        .await;
    assert_eq!(r.json(), json!({ "id": "Thesis Backup" }));

    // A bad archive fails cleanly and leaves no half-imported project behind.
    let before: Vec<_> = std::fs::read_dir(h.root.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    let r = h
        .send(multipart_to(
            "/api/projects/import",
            &[
                ("name", None, b"Broken"),
                ("file", Some("b.zip"), b"not a zip"),
            ],
        ))
        .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(!h.root.path().join("Broken").exists());
    let after: Vec<_> = std::fs::read_dir(h.root.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(before.len(), after.len());
    let r = h
        .send(multipart_to(
            "/api/projects/import",
            &[("name", None, b"Empty")],
        ))
        .await;
    assert_eq!(
        (r.status, r.json()),
        (
            StatusCode::BAD_REQUEST,
            json!({ "error": "ZIP file is required" })
        )
    );
}

#[tokio::test]
async fn changing_the_library_folder_switches_projects_and_is_remembered() {
    let h = harness();
    let other = tempfile::tempdir().unwrap();
    let cfg = other.path().join("cfg/config.json");
    let new_root = other.path().join("My Projects");

    // Rebuild the router with a config path so persistence is observable.
    let library = Arc::new(Library::new(h.root.path().to_path_buf()));
    let state = test_state(library, Some(cfg.clone()));
    let h = Harness {
        app: router::<ApiState>().with_state(state),
        root: h.root,
    };

    assert_eq!(
        h.get("/api/settings").await.json()["libraryPath"],
        h.root.path().to_str().unwrap()
    );
    let r = h
        .post("/api/settings", json!({ "libraryPath": "relative/dir" }))
        .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);

    let r = h
        .post(
            "/api/settings",
            json!({ "libraryPath": new_root.to_str().unwrap() }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(
        new_root.is_dir(),
        "the folder is created if it doesn't exist"
    );
    assert_eq!(
        h.get("/api/projects").await.json(),
        json!({ "projects": [] }),
        "now looking at the new folder"
    );
    h.post(
        "/api/projects",
        json!({ "name": "Fresh", "template": "blank" }),
    )
    .await;
    assert!(new_root.join("Fresh/main.tex").exists());
    assert_eq!(
        crate::config::load(&cfg)
            .library_path
            .unwrap()
            .file_name()
            .unwrap(),
        "My Projects"
    );
}

#[tokio::test]
async fn an_unreadable_library_folder_is_reported_with_its_path_not_a_generic_500() {
    let h = harness();
    let gone = h.root.path().join("unplugged-drive");
    // A folder the user chose in Settings: if it vanishes they are told, it isn't recreated empty.
    let library = Library::with_source(gone.clone(), crate::library::RootSource::Saved);
    let state = test_state(Arc::new(library), None);
    let h = Harness {
        app: router::<ApiState>().with_state(state),
        root: h.root,
    };

    let r = h.get("/api/projects").await;
    assert_eq!(r.status, StatusCode::INTERNAL_SERVER_ERROR);
    let body = r.json();
    let msg = body["error"].as_str().unwrap().to_owned();
    assert!(
        msg.contains("Can't read the library folder") && msg.contains("unplugged-drive"),
        "{msg}"
    );
    assert!(
        body["hint"].is_string(),
        "the user is told what to try: {body}"
    );
    assert!(!gone.exists(), "listing must not recreate a chosen folder");

    // Pointing the app at a usable folder repairs it without a restart.
    let fixed = h.root.path().join("fixed");
    let r = h
        .post(
            "/api/settings",
            json!({ "libraryPath": fixed.to_str().unwrap() }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(
        h.get("/api/projects").await.json(),
        json!({ "projects": [] })
    );
}

// ---- First run and the library folder ----------------------------------------------------

/// A router whose library is the app's own default folder, which does not exist yet: a first run.
/// Returns the harness, the default folder and the config file's path.
fn first_run() -> (Harness, std::path::PathBuf, std::path::PathBuf) {
    let h = harness();
    let default = h.root.path().join("Documents").join("SomeScript");
    let cfg = h.root.path().join("cfg").join("config.json");
    let library = Library::with_source(default.clone(), crate::library::RootSource::Default);
    let mut state = test_state(Arc::new(library), Some(cfg.clone()));
    state.default_library = default.clone();
    let h = Harness {
        app: router::<ApiState>().with_state(state),
        root: h.root,
    };
    (h, default, cfg)
}

#[tokio::test]
async fn the_first_run_gate_reads_settings_without_touching_the_library_folder() {
    let (h, default, _cfg) = first_run();
    let r = h.get("/api/settings").await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(
        r.json(),
        json!({
            "libraryPath": default.to_str().unwrap(),
            "source": "default",
            "onboarded": false,
            "defaultLibraryPath": default.to_str().unwrap(),
            "logFile": null,
            "autoUpdate": true,
            "lastUpdateCheck": null,
        })
    );
    assert!(
        !default.exists(),
        "reading the settings must not create, or even open, the folder: the OS may ask permission for it"
    );
}

#[tokio::test]
async fn creating_a_project_works_when_the_default_folder_does_not_exist_yet() {
    // The reported bug: the default folder could not be made at launch, and creating a project
    // then failed with "File not found".
    let (h, default, _cfg) = first_run();
    let r = h
        .post(
            "/api/projects",
            json!({ "name": "Paper", "template": "blank" }),
        )
        .await;
    assert_eq!(
        r.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&r.body)
    );
    assert_eq!(r.json(), json!({ "id": "Paper" }));
    assert!(default.join("Paper").join("main.tex").is_file());
}

#[tokio::test]
async fn listing_makes_the_apps_own_default_folder_as_it_used_to_at_launch() {
    let (h, default, _cfg) = first_run();
    assert_eq!(
        h.get("/api/projects").await.json(),
        json!({ "projects": [] })
    );
    assert!(default.is_dir());
}

#[tokio::test]
async fn creating_in_a_vanished_chosen_folder_explains_it_instead_of_saying_file_not_found() {
    let h = harness();
    let gone = h.root.path().join("unplugged-drive");
    let library = Library::with_source(gone.clone(), crate::library::RootSource::Saved);
    let h = Harness {
        app: router::<ApiState>().with_state(test_state(Arc::new(library), None)),
        root: h.root,
    };
    let r = h
        .post(
            "/api/projects",
            json!({ "name": "Paper", "template": "blank" }),
        )
        .await;
    assert_ne!(r.status, StatusCode::OK);
    let body = r.json();
    let msg = body["error"].as_str().unwrap();
    assert!(msg.contains("unplugged-drive"), "{msg}");
    assert!(!msg.contains("File not found"), "{msg}");
    assert!(body["hint"].is_string(), "{body}");
    assert!(!gone.exists(), "a chosen folder is not recreated empty");
}

#[tokio::test]
async fn finishing_setup_is_remembered_and_choosing_a_folder_keeps_it() {
    let (h, default, cfg) = first_run();
    let r = h.post("/api/settings", json!({ "onboarded": true })).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.json()["onboarded"], true);
    assert!(crate::config::load(&cfg).onboarded);
    assert!(!default.exists(), "the flag alone creates nothing");

    // The config is merged, not rewritten: choosing a folder must not wipe the flag.
    let chosen = h.root.path().join("Mine");
    let r = h
        .post(
            "/api/settings",
            json!({ "libraryPath": chosen.to_str().unwrap() }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(chosen.is_dir());
    let saved = crate::config::load(&cfg);
    assert!(saved.onboarded);
    assert_eq!(saved.library_path.unwrap().file_name().unwrap(), "Mine");
    assert_eq!(h.get("/api/settings").await.json()["source"], "saved");

    let r = h.post("/api/settings", json!({})).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn setup_counts_as_done_for_a_saved_folder_and_for_an_explicit_override() {
    // 0.1.0 and 0.1.1 stored a library path when the user changed folders: nothing left to ask.
    let (h, _default, cfg) = first_run();
    crate::config::update(&cfg, |c| c.library_path = Some(h.root.path().join("Old"))).unwrap();
    assert_eq!(h.get("/api/settings").await.json()["onboarded"], true);
    // SOMESCRIPT_LIBRARY (developers, tests, portable use): the default harness uses one.
    assert_eq!(
        harness().get("/api/settings").await.json()["onboarded"],
        true
    );
}

#[tokio::test]
async fn auto_update_settings_roundtrip_and_validation() {
    let (h, _default, cfg) = first_run();

    let initial = h.get("/api/settings").await;
    assert_eq!(initial.status, StatusCode::OK);
    assert_eq!(initial.json()["autoUpdate"], true);
    assert_eq!(initial.json()["lastUpdateCheck"], Value::Null);

    let r = h
        .post("/api/settings", json!({ "autoUpdate": false }))
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.json()["autoUpdate"], false);
    assert!(!crate::config::load(&cfg).auto_update);

    let r = h.get("/api/settings").await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.json()["autoUpdate"], false);

    let r = h
        .post(
            "/api/settings",
            json!({ "lastUpdateCheck": 1710000000000u64 }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.json()["lastUpdateCheck"], 1710000000000u64);
    assert_eq!(
        crate::config::load(&cfg).last_update_check,
        Some(1710000000000)
    );

    let r = h.get("/api/settings").await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.json()["autoUpdate"], false);
    assert_eq!(r.json()["lastUpdateCheck"], 1710000000000u64);

    for bad in [
        json!({ "autoUpdate": "false" }),
        json!({ "autoUpdate": 123 }),
        json!({ "lastUpdateCheck": -1 }),
        json!({ "lastUpdateCheck": "yesterday" }),
    ] {
        let r = h.post("/api/settings", bad).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
    }
}

fn enc(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
}

#[tokio::test]
async fn the_folder_check_describes_a_folder_without_creating_it() {
    let (h, default, _cfg) = first_run();
    let uri = |p: &std::path::Path| format!("/api/library/check?path={}", enc(p.to_str().unwrap()));

    // Doesn't exist yet, but can be made.
    let c = h.get(&uri(&default)).await.json();
    assert_eq!(
        (&c["exists"], &c["creatable"], &c["issue"]),
        (&json!(false), &json!(true), &Value::Null),
        "{c}"
    );
    assert!(!default.exists(), "checking a folder must not create it");

    // A folder with a project in it (the harness makes `p1`).
    let c = h.get(&uri(h.root.path())).await.json();
    assert_eq!(
        (&c["exists"], &c["writable"], &c["projectCount"]),
        (&json!(true), &json!(true), &json!(1)),
        "{c}"
    );

    // A file where a folder should be is an issue with words, not a bare failure.
    let file = h.root.path().join("a-file");
    std::fs::write(&file, "x").unwrap();
    let c = h.get(&uri(&file)).await.json();
    assert_eq!(c["issue"]["kind"], "not_a_folder", "{c}");
    assert!(c["issue"]["message"].as_str().unwrap().contains("file"));

    let r = h.get("/api/library/check").await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let c = h.get("/api/library/check?path=relative%2Fdir").await.json();
    assert_eq!(c["issue"]["kind"], "not_absolute", "{c}");
}

#[tokio::test]
async fn the_folder_name_preview_is_what_creating_would_name_it() {
    async fn preview(h: &Harness, name: &str) -> Value {
        h.get(&format!("/api/projects/folder-name?name={}", enc(name)))
            .await
            .json()
    }
    let h = harness(); // holds a project called `p1`
    assert_eq!(
        preview(&h, "My Thesis").await,
        json!({ "id": "My Thesis", "changed": false })
    );
    assert_eq!(
        preview(&h, "a/b").await,
        json!({ "id": "a-b", "changed": true })
    );
    assert_eq!(
        preview(&h, "con").await,
        json!({ "id": "_con", "changed": true })
    );
    assert_eq!(
        preview(&h, "P1").await,
        json!({ "id": "P1 2", "changed": true }),
        "taken, case-insensitively"
    );
    assert_eq!(
        preview(&h, "  padded  ").await,
        json!({ "id": "padded", "changed": false })
    );
    let r = h
        .post(
            "/api/projects",
            json!({ "name": "a/b", "template": "blank" }),
        )
        .await;
    assert_eq!(
        r.json(),
        json!({ "id": "a-b" }),
        "the preview told the truth"
    );
}

#[tokio::test]
async fn diagnostics_is_a_text_report_that_never_includes_secrets() {
    let h = harness();
    let key = ["sk", "diag", "0123456789abcdef"].join("-");
    let r = h
        .post(
            "/api/ai/providers",
            json!({ "name": "X", "kind": "openai", "baseUrl": "https://127.0.0.1:9/v1", "apiKey": key }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK);

    let r = h.get("/api/diagnostics").await;
    assert_eq!(r.status, StatusCode::OK);
    assert!(
        r.headers[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/plain")
    );
    let text = String::from_utf8(r.body).unwrap();
    for expected in [
        "SomeScript ",
        "Platform:",
        "WebView: test-webview 1.0",
        "Library:",
        "tectonic:",
        "synctex:",
    ] {
        assert!(text.contains(expected), "{expected} missing from:\n{text}");
    }
    assert!(text.contains(h.root.path().to_str().unwrap()), "{text}");
    assert!(!text.contains(&key), "the key must never be in a report");
}

// ---- AI assistant -------------------------------------------------------------------------

mod ai_routes {
    use super::*;
    use crate::ai::testing::{Reply as Mocked, spawn_mock};

    const SECRET: &str = "sk-live-0123456789abcdef";

    fn sse_text(text: &str) -> String {
        format!(
            "data: {}\n\ndata: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"stop\"}}]}}\n\ndata: [DONE]\n\n",
            json!({ "choices": [{ "delta": { "content": text } }] })
        )
    }

    fn sse_tool(name: &str, args: &str) -> String {
        format!(
            "data: {}\n\ndata: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"tool_calls\"}}]}}\n\ndata: [DONE]\n\n",
            json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "id": "x", "function": { "name": name, "arguments": args } }] } }] })
        )
    }

    async fn add_provider(h: &Harness, url: &str) -> String {
        let r = h
            .post(
                "/api/ai/providers",
                json!({ "name": "Mock", "kind": "openai", "baseUrl": url, "apiKey": SECRET, "defaultModel": "mock-1" }),
            )
            .await;
        assert_eq!(
            r.status,
            StatusCode::OK,
            "{}",
            String::from_utf8_lossy(&r.body)
        );
        r.json()["provider"]["id"].as_str().unwrap().to_owned()
    }

    fn events(r: &Reply) -> Vec<Value> {
        String::from_utf8(r.body.clone())
            .unwrap()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    #[tokio::test]
    async fn settings_start_empty_and_the_key_never_comes_back_out() {
        let h = harness();
        let r = h.get("/api/ai/settings").await;
        assert_eq!(r.status, StatusCode::OK);
        assert_eq!(r.json()["providers"], json!([]));
        assert_eq!(r.json()["activeProviderId"], Value::Null);

        let id = add_provider(&h, "https://api.example.com/v1/").await;
        let after = h.get("/api/ai/settings").await;
        let text = String::from_utf8(after.body.clone()).unwrap();
        assert!(
            !text.contains(SECRET) && !text.contains("sk-live"),
            "{text}"
        );
        let p = &after.json()["providers"][0];
        assert_eq!(p["id"], id.as_str());
        assert_eq!(p["baseUrl"], "https://api.example.com/v1");
        assert_eq!(p["hasKey"], true);
        assert_eq!(p["keyHint"], "cdef");
        assert_eq!(after.json()["activeProviderId"], id.as_str());

        // Editing without a key keeps it; the saved key still works (checked in the chat test).
        let r = h
            .post(
                "/api/ai/providers",
                json!({ "id": id, "name": "Renamed", "kind": "openai", "baseUrl": "https://api.example.com/v1" }),
            )
            .await;
        assert_eq!(r.json()["provider"]["hasKey"], true);
        assert_eq!(r.json()["provider"]["name"], "Renamed");

        let r = h
            .post(
                "/api/ai/settings",
                json!({ "customInstructions": "Use biblatex." }),
            )
            .await;
        assert_eq!(r.json()["customInstructions"], "Use biblatex.");
        let r = h
            .post("/api/ai/providers/delete", json!({ "id": id }))
            .await;
        assert_eq!(r.json()["providers"], json!([]));
        let r = h
            .post("/api/ai/providers/delete", json!({ "id": id }))
            .await;
        assert_eq!(r.status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn bad_provider_forms_are_rejected_with_a_reason() {
        let h = harness();
        for (body, needle) in [
            (json!({ "name": "", "baseUrl": "https://x.com" }), "name"),
            (json!({ "name": "A", "baseUrl": "x.com" }), "Base URL"),
            (json!({ "name": "A", "baseUrl": "ftp://x.com" }), "http"),
            (
                json!({ "name": "A", "baseUrl": "https://u:p@x.com" }),
                "credentials",
            ),
            (
                json!({ "name": "A", "baseUrl": "https://x.com", "apiKeyHeader": "bad header" }),
                "header",
            ),
            (
                json!({ "name": "A", "baseUrl": "https://x.com", "kind": "carrier-pigeon" }),
                "valid",
            ),
        ] {
            let r = h.post("/api/ai/providers", body.clone()).await;
            assert_eq!(r.status, StatusCode::BAD_REQUEST, "{body}");
            let msg = r.json()["error"].as_str().unwrap().to_owned();
            assert!(msg.contains(needle), "{body} -> {msg}");
        }
        assert_eq!(
            h.get("/api/ai/settings").await.json()["providers"],
            json!([])
        );
    }

    #[tokio::test]
    async fn testing_a_provider_lists_models_or_explains_why_not() {
        let h = harness();
        let mock = spawn_mock(vec![Mocked::Sse(sse_text("ok"))]).await;
        let form =
            json!({ "name": "Mock", "kind": "openai", "baseUrl": mock.url, "apiKey": SECRET });

        let r = h.post("/api/ai/providers/test", form.clone()).await;
        assert_eq!(
            r.json(),
            json!({ "ok": true, "models": ["mock-1", "mock-2"] })
        );
        let sent = mock.requests();
        assert_eq!(
            (sent[0].method.as_str(), sent[0].path.as_str()),
            ("GET", "/models")
        );
        assert_eq!(sent[0].headers["authorization"], format!("Bearer {SECRET}"));

        // A real round trip with a model name.
        let mut chat = form.clone();
        chat["mode"] = json!("chat");
        chat["model"] = json!("mock-1");
        let r = h.post("/api/ai/providers/test", chat.clone()).await;
        assert_eq!(r.json()["ok"], true, "{}", String::from_utf8_lossy(&r.body));
        assert_eq!(r.json()["sample"], "ok");
        let mut no_model = chat;
        no_model["model"] = json!("");
        assert_eq!(
            h.post("/api/ai/providers/test", no_model).await.json()["ok"],
            false
        );

        // A rejected key.
        mock.set_models(
            StatusCode::UNAUTHORIZED,
            json!({ "error": { "message": "bad key" } }),
        );
        let r = h.post("/api/ai/providers/test", form.clone()).await;
        assert_eq!(r.status, StatusCode::OK);
        assert_eq!(r.json()["ok"], false);
        assert!(
            r.json()["error"]
                .as_str()
                .unwrap()
                .contains("rejected the API key")
        );

        // An endpoint that has no /models still gets a hint instead of a dead end.
        mock.set_models(StatusCode::NOT_FOUND, json!({}));
        let r = h.post("/api/ai/providers/test", form.clone()).await;
        assert!(
            r.json()["error"]
                .as_str()
                .unwrap()
                .contains("type a model name")
        );

        // Something that answers, but not with models.
        mock.set_models(StatusCode::OK, json!({ "hello": "world" }));
        assert!(
            h.post("/api/ai/providers/test", form).await.json()["error"]
                .as_str()
                .unwrap()
                .contains("not with a list of models")
        );

        // Nothing is listening.
        let dead = json!({ "name": "Dead", "kind": "openai", "baseUrl": "http://127.0.0.1:9/v1" });
        let r = h.post("/api/ai/providers/test", dead).await;
        assert!(
            r.json()["error"]
                .as_str()
                .unwrap()
                .contains("Couldn't reach")
        );
    }

    #[tokio::test]
    async fn testing_a_saved_provider_reuses_its_stored_key() {
        let h = harness();
        let mock = spawn_mock(vec![]).await;
        let id = add_provider(&h, &mock.url).await;
        // The edit form sends no key (it never has it); the server fills in the saved one.
        let r = h
            .post(
                "/api/ai/providers/test",
                json!({ "id": id, "name": "Mock", "kind": "openai", "baseUrl": mock.url }),
            )
            .await;
        assert_eq!(r.json()["ok"], true);
        assert_eq!(
            mock.requests()[0].headers["authorization"],
            format!("Bearer {SECRET}")
        );
    }

    #[tokio::test]
    async fn chat_streams_events_and_runs_tools_in_the_project() {
        let h = harness();
        std::fs::write(h.file("main.tex"), "Hello\n").unwrap();
        let mock = spawn_mock(vec![
            Mocked::Sse(sse_tool(
                "edit_file",
                r#"{"path":"main.tex","oldText":"Hello","newText":"Hello, world"}"#,
            )),
            Mocked::Sse(sse_text("Done.")),
        ])
        .await;
        add_provider(&h, &mock.url).await;

        let r = h
            .post(
                "/api/ai/chat",
                json!({
                    "projectId": "p1",
                    "openFile": "main.tex",
                    "messages": [{ "id": "1", "role": "user", "text": "make it friendlier" }],
                }),
            )
            .await;
        assert_eq!(r.status, StatusCode::OK);
        assert_eq!(
            r.headers[header::CONTENT_TYPE],
            "application/x-ndjson; charset=utf-8"
        );
        let ev = events(&r);
        let kinds: Vec<_> = ev.iter().map(|e| e["type"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["start", "tool-call", "tool-result", "text", "done"]);
        assert_eq!(ev[0]["model"], "mock-1");
        assert_eq!(ev[2]["ok"], true);
        assert_eq!(
            std::fs::read_to_string(h.file("main.tex")).unwrap(),
            "Hello, world\n"
        );

        let first = &mock.requests()[0];
        assert_eq!(first.headers["authorization"], format!("Bearer {SECRET}"));
        let system = first.body["messages"][0]["content"].as_str().unwrap();
        assert!(
            system.ends_with("[openFile: main.tex]"),
            "the open file reaches the model"
        );
    }

    #[tokio::test]
    async fn chat_continues_a_conversation_from_the_clients_history() {
        let h = harness();
        let mock = spawn_mock(vec![Mocked::Sse(sse_text("Because."))]).await;
        add_provider(&h, &mock.url).await;
        let r = h
            .post(
                "/api/ai/chat",
                json!({
                    "projectId": "p1",
                    "messages": [
                        { "role": "user", "text": "What is a bibitem?" },
                        { "role": "assistant", "parts": [{ "type": "text", "text": "An entry." }] },
                        { "role": "user", "text": "Why?" },
                    ],
                }),
            )
            .await;
        assert_eq!(events(&r).last().unwrap()["reason"], "stop");
        let sent = mock.requests()[0].body["messages"].clone();
        let roles: Vec<_> = sent
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["role"].as_str().unwrap())
            .collect();
        assert_eq!(roles, ["system", "user", "assistant", "user"]);
    }

    #[tokio::test]
    async fn a_provider_error_is_a_stream_event_and_never_contains_the_key() {
        let h = harness();
        let mock = spawn_mock(vec![Mocked::Json(
            StatusCode::UNAUTHORIZED,
            json!({ "error": { "message": format!("Invalid key {SECRET}") } }),
        )])
        .await;
        add_provider(&h, &mock.url).await;
        let r = h
            .post(
                "/api/ai/chat",
                json!({ "projectId": "p1", "messages": [{ "role": "user", "text": "hi" }] }),
            )
            .await;
        assert_eq!(r.status, StatusCode::OK);
        let text = String::from_utf8(r.body.clone()).unwrap();
        assert!(!text.contains(SECRET), "{text}");
        let ev = events(&r);
        assert_eq!(ev[1]["type"], "error");
        assert!(ev[1]["message"].as_str().unwrap().contains("[your key]"));
        assert_eq!(ev.last().unwrap()["reason"], "error");
    }

    #[tokio::test]
    async fn chat_setup_problems_are_plain_json_errors() {
        let h = harness();
        let user = json!([{ "role": "user", "text": "hi" }]);

        let r = h
            .post(
                "/api/ai/chat",
                json!({ "projectId": "p1", "messages": user }),
            )
            .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        assert!(
            r.json()["error"]
                .as_str()
                .unwrap()
                .contains("No AI provider is set up")
        );

        add_provider(&h, "https://api.example.com/v1").await;
        let r = h
            .post(
                "/api/ai/chat",
                json!({ "projectId": "nope", "messages": user }),
            )
            .await;
        assert_eq!(r.status, StatusCode::NOT_FOUND);
        let r = h
            .post("/api/ai/chat", json!({ "projectId": "p1", "messages": [] }))
            .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        let r = h.post("/api/ai/chat", json!({ "projectId": "p1" })).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        let r = h
            .post(
                "/api/ai/chat",
                json!({ "projectId": "p1", "messages": [{ "role": "user", "text": "hi" }, { "role": "assistant", "parts": [{ "type": "text", "text": "hello" }] }] }),
            )
            .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST);
        assert!(r.json()["error"].as_str().unwrap().contains("last message"));
    }

    #[tokio::test]
    async fn chat_history_round_trips_per_project_and_refuses_unsafe_ids() {
        let h = harness();
        let index = json!({ "threads": [{ "id": "t1", "title": "First chat", "createdAt": 1 }], "activeThreadId": "t1" });
        assert_eq!(
            h.get("/api/chat/threads?projectId=p1").await.json()["index"]["threads"],
            json!([])
        );
        let r = h
            .json(
                Method::PUT,
                "/api/chat/threads",
                json!({ "projectId": "p1", "index": index }),
            )
            .await;
        assert_eq!(r.json(), json!({ "success": true }));
        assert_eq!(
            h.get("/api/chat/threads?projectId=p1").await.json()["index"],
            index
        );

        assert_eq!(
            h.get("/api/chat/thread?projectId=p1&threadId=t1")
                .await
                .json(),
            json!({ "snapshot": null })
        );
        let messages = json!([{ "role": "user", "text": "hi" }]);
        let r = h
            .json(
                Method::PUT,
                "/api/chat/thread",
                json!({ "projectId": "p1", "threadId": "t1", "messages": messages }),
            )
            .await;
        assert_eq!(r.status, StatusCode::OK);
        let got = h
            .get("/api/chat/thread?projectId=p1&threadId=t1")
            .await
            .json();
        assert_eq!(got["snapshot"]["messages"], messages);
        assert!(h.file(".somescript/chat/threads/t1.json").is_file());

        let del = h
            .send(
                Request::delete("/api/chat/thread?projectId=p1&threadId=t1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        assert_eq!(del.status, StatusCode::OK);
        assert_eq!(
            h.get("/api/chat/thread?projectId=p1&threadId=t1")
                .await
                .json(),
            json!({ "snapshot": null })
        );

        for bad in ["../evil", "a/b", ""] {
            let r = h
                .json(
                    Method::PUT,
                    "/api/chat/thread",
                    json!({ "projectId": "p1", "threadId": bad, "messages": [] }),
                )
                .await;
            assert_eq!(r.status, StatusCode::BAD_REQUEST, "{bad:?}");
        }
        assert_eq!(
            h.get("/api/chat/thread?projectId=p1&threadId=..%2Fx")
                .await
                .status,
            StatusCode::BAD_REQUEST
        );
        assert!(!h.root.path().join("evil.json").exists());
        let r = h
            .json(
                Method::PUT,
                "/api/chat/threads",
                json!({ "projectId": "nope", "index": index }),
            )
            .await;
        assert_eq!(r.status, StatusCode::NOT_FOUND);
    }
}
