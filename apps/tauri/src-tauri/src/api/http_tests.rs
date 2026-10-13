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

fn harness() -> Harness {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("p1")).unwrap();
    let library = Arc::new(Library::new(root.path().to_path_buf()));
    let tex = Arc::new(TexTools::new("never-run".into(), "never-run".into()));
    let templates_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("templates");
    let state = ApiState {
        library,
        tex,
        templates_dir,
        config_path: None,
    };
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
    let state = ApiState {
        library,
        tex: Arc::new(TexTools::new("never-run".into(), "never-run".into())),
        templates_dir: std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("templates"),
        config_path: Some(cfg.clone()),
    };
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
    let state = ApiState {
        library: Arc::new(Library::new(gone.clone())),
        tex: Arc::new(TexTools::new("never-run".into(), "never-run".into())),
        templates_dir: std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("templates"),
        config_path: None,
    };
    let h = Harness {
        app: router::<ApiState>().with_state(state),
        root: h.root,
    };

    let r = h.get("/api/projects").await;
    assert_eq!(r.status, StatusCode::INTERNAL_SERVER_ERROR);
    let msg = r.json()["error"].as_str().unwrap().to_owned();
    assert!(
        msg.contains("Can't read the library folder") && msg.contains("unplugged-drive"),
        "{msg}"
    );

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
