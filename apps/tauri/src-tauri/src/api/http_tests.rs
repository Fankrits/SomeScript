//! Drives the real router the way the editor UI does, checking status codes, headers and
//! JSON shapes: those are the contract with apps/editor, so they are what must not drift.

use super::{ApiState, router};
use crate::library::Library;
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

fn harness() -> Harness {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("p1")).unwrap();
    let library = Arc::new(Library::new(root.path().to_path_buf()));
    let state = ApiState { library };
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
