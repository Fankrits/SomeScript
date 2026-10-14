//! Port of apps/compiler/index.ts local mode: `/compile` (Tectonic) and `/synctex` (the
//! official `synctex` CLI). The log protocol is what the editor UI parses, so it is kept
//! byte-for-byte: Tectonic's own output, then `[SUCCESS] <pdf>` or `[ERROR] ...`.
//!
//! One deliberate difference: the PDF goes to `.preview-cache/<path>.pdf`, where the UI
//! looks for it (the cloud compiler's local mode leaves it beside the .tex, which the UI
//! never reads). `.synctex.gz` lands next to the PDF, where the synctex CLI expects it.

use crate::{
    error::{ApiError, ApiResult},
    storage::Project,
};
use axum::body::Bytes;
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::AsyncReadExt,
    process::Command,
    sync::{Semaphore, mpsc},
};

pub struct TexTools {
    tectonic: PathBuf,
    synctex: PathBuf,
    gate: Semaphore,
    attempt_timeout: Duration,
}

impl TexTools {
    pub fn new(tectonic: PathBuf, synctex: PathBuf) -> Self {
        Self {
            tectonic,
            synctex,
            // ponytail: one compile at a time, queued. Tectonic is CPU-bound and the UI is one window.
            gate: Semaphore::new(1),
            // A cold first run downloads the TeX bundle, which can be slow on a poor connection.
            attempt_timeout: Duration::from_secs(600),
        }
    }

    /// Finds the sidecars: env override -> next to the app binary (where Tauri bundles
    /// `externalBin`) -> `<resource dir>/bin` (Linux, where `/usr/bin/synctex` would collide with
    /// TeX Live's own package, so the sidecars ship as resources) -> `src-tauri/binaries/<name>-<triple>`
    /// in dev -> PATH.
    pub fn locate(resource_dir: Option<&Path>) -> Self {
        Self::new(
            find_tool("tectonic", "TECTONIC_BIN", resource_dir),
            find_tool("synctex", "SYNCTEX_BIN", resource_dir),
        )
    }

    /// Where the sidecars were found (or the bare name that will be looked up on `PATH`), for the
    /// diagnostics report.
    pub fn paths(&self) -> (&Path, &Path) {
        (&self.tectonic, &self.synctex)
    }
}

/// A child process for a bundled tool. On Windows the app has no console of its own
/// (`windows_subsystem = "windows"`), so without CREATE_NO_WINDOW every console program it starts
/// gets a black window of its own: one flashing up on each compile (auto-compile makes that every
/// few seconds) and on each SyncTeX click.
fn tool_command(program: &Path) -> Command {
    #[allow(unused_mut)] // only Windows changes it
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command
}

fn find_tool(name: &str, env_var: &str, resource_dir: Option<&Path>) -> PathBuf {
    if let Some(p) = std::env::var_os(env_var) {
        return p.into();
    }
    let exe = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    };
    let beside_app = std::env::current_exe()
        .ok()
        .and_then(|p| Some(p.parent()?.join(&exe)));
    let in_resources = resource_dir.map(|d| d.join("bin").join(&exe));
    if let Some(p) = beside_app
        .into_iter()
        .chain(in_resources)
        .find(|p| p.is_file())
    {
        return p;
    }
    if cfg!(debug_assertions) {
        let suffix = if cfg!(windows) { ".exe" } else { "" };
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("{name}-{}{suffix}", env!("SS_TARGET")));
        if dev.is_file() {
            return dev;
        }
    }
    PathBuf::from(exe)
}

/// Output Tectonic prints when it can't reach its bundle server (observed on 0.17.0).
fn looks_like_network_failure(log: &str) -> bool {
    let log = log.to_lowercase();
    [
        "failure fetching",
        "error sending request",
        "dns error",
        "tcp connect error",
        "connection refused",
        "network is unreachable",
    ]
    .iter()
    .any(|marker| log.contains(marker))
}

/// Validates the request, then streams the compile log. Dropping the receiver (the UI
/// aborted) kills Tectonic.
pub fn start_compile(
    tools: Arc<TexTools>,
    project: &Project,
    tex_rel: &str,
) -> ApiResult<mpsc::Receiver<Bytes>> {
    if !tex_rel.ends_with(".tex") {
        return Err(ApiError::bad_request("Only .tex files can be compiled"));
    }
    let tex_abs = project.resolve(tex_rel)?;
    if !tex_abs.is_file() {
        return Err(ApiError::not_found("File not found"));
    }
    // Normalized relative path (`a/./b.tex` -> `a/b.tex`), with `/` on every platform.
    let rel = tex_abs
        .strip_prefix(project.root())
        .map_err(|_| ApiError::bad_request("Directory traversal attempt detected"))?
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    let pdf_rel = format!("{}.pdf", rel.trim_end_matches(".tex"));
    let outdir = project
        .root()
        .join(".preview-cache")
        .join(Path::new(&rel).parent().unwrap_or(Path::new("")));

    let (tx, rx) = mpsc::channel(64);
    tokio::spawn(run_compile(
        tools,
        project.root().to_path_buf(),
        tex_abs,
        outdir,
        pdf_rel,
        tx,
    ));
    Ok(rx)
}

async fn say(tx: &mpsc::Sender<Bytes>, text: &str) {
    let _ = tx.send(Bytes::copy_from_slice(text.as_bytes())).await;
}

async fn run_compile(
    tools: Arc<TexTools>,
    root: PathBuf,
    tex_abs: PathBuf,
    outdir: PathBuf,
    pdf_rel: String,
    tx: mpsc::Sender<Bytes>,
) {
    let _permit = tokio::select! {
        p = tools.gate.acquire() => match p { Ok(p) => p, Err(_) => return },
        _ = tx.closed() => return, // gave up while queued
    };
    if let Err(e) = tokio::fs::create_dir_all(&outdir).await {
        say(
            &tx,
            &format!("\n[ERROR] Could not create the output folder: {e}\n"),
        )
        .await;
        return;
    }
    let args = |cached_only: bool| -> Vec<String> {
        let mut a = Vec::new();
        if cached_only {
            a.push("-C".to_owned());
        }
        a.extend(["--synctex".to_owned(), "--outdir".to_owned()]);
        a.push(outdir.to_string_lossy().into_owned());
        a.push(tex_abs.to_string_lossy().into_owned());
        a
    };

    let mut log = String::new();
    let mut outcome = attempt(&tools, &root, &args(true), &tx, &mut log).await;
    if matches!(outcome, Attempt::Exit(code) if code != 0) {
        say(
            &tx,
            "\n[INFO] Cached compilation failed. Retrying with remote package fetching...\n",
        )
        .await;
        log.clear();
        outcome = attempt(&tools, &root, &args(false), &tx, &mut log).await;
    }

    match outcome {
        Attempt::Cancelled => {}
        Attempt::SpawnFailed => {} // already reported
        Attempt::Exit(0) if outdir.join(file_name(&pdf_rel)).is_file() => {
            say(&tx, &format!("\n[SUCCESS] {pdf_rel}\n")).await;
        }
        Attempt::Exit(0) => {
            say(&tx, "\n[ERROR] Tectonic finished but produced no PDF\n").await;
        }
        Attempt::Exit(code) => {
            if looks_like_network_failure(&log) {
                say(
                    &tx,
                    "\n[NETWORK] Couldn't download the LaTeX packages this document needs. \
                     Check your internet connection, then compile again.\n",
                )
                .await;
            }
            say(
                &tx,
                &format!("\n[ERROR] Tectonic exited with code {code}\n"),
            )
            .await;
        }
    }
}

fn file_name(rel: &str) -> &str {
    rel.rsplit('/').next().unwrap_or(rel)
}

enum Attempt {
    Exit(i32),
    SpawnFailed,
    Cancelled,
}

/// Runs Tectonic once, forwarding stdout and stderr to the client as they arrive and
/// keeping the tail of the output in `log` (to recognize network failures).
async fn attempt(
    tools: &TexTools,
    root: &Path,
    args: &[String],
    tx: &mpsc::Sender<Bytes>,
    log: &mut String,
) -> Attempt {
    let spawned = tool_command(&tools.tectonic)
        .args(args)
        .current_dir(root)
        .env("TECTONIC_UNTRUSTED_MODE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) => {
            say(
                tx,
                &format!(
                    "\n[ERROR] Failed to start Tectonic: {e}\n\
                     The LaTeX engine ships inside the app. If it is missing, reinstall SomeScript.\n"
                ),
            )
            .await;
            return Attempt::SpawnFailed;
        }
    };
    let (mut stdout, mut stderr) = (child.stdout.take().unwrap(), child.stderr.take().unwrap());

    let pump = async {
        let (mut a, mut b) = ([0u8; 8192], [0u8; 8192]);
        let (mut out_open, mut err_open) = (true, true);
        while out_open || err_open {
            let chunk = tokio::select! {
                n = stdout.read(&mut a), if out_open => match n {
                    Ok(n) if n > 0 => Bytes::copy_from_slice(&a[..n]),
                    _ => { out_open = false; continue }
                },
                n = stderr.read(&mut b), if err_open => match n {
                    Ok(n) if n > 0 => Bytes::copy_from_slice(&b[..n]),
                    _ => { err_open = false; continue }
                },
            };
            log.push_str(&String::from_utf8_lossy(&chunk));
            if log.len() > 128 * 1024 {
                let cut = log.ceil_char_boundary(log.len() - 64 * 1024);
                log.drain(..cut);
            }
            if tx.send(chunk).await.is_err() {
                return false; // client went away
            }
        }
        true
    };

    let finished = tokio::select! {
        done = tokio::time::timeout(tools.attempt_timeout, pump) => done,
        _ = tx.closed() => Ok(false),
    };
    match finished {
        Ok(true) => match child.wait().await {
            Ok(status) => Attempt::Exit(status.code().unwrap_or(-1)),
            Err(_) => Attempt::Exit(-1),
        },
        Ok(false) => {
            let _ = child.kill().await;
            Attempt::Cancelled
        }
        Err(_) => {
            let _ = child.kill().await;
            say(tx, "\n[ERROR] Compilation timed out and was stopped\n").await;
            Attempt::Exit(-1)
        }
    }
}

// ---- SyncTeX ---------------------------------------------------------------------------

/// Parses `synctex view|edit` output: blocks of `Key:value` lines, one block per result,
/// each starting with an `Output:` line. Coordinates are PDF points from the top-left.
pub fn parse_synctex_output(text: &str) -> Vec<std::collections::HashMap<String, String>> {
    let mut blocks: Vec<std::collections::HashMap<String, String>> = Vec::new();
    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key == "Output" {
            blocks.push(Default::default());
        } else if let Some(current) = blocks.last_mut() {
            current.insert(key.to_owned(), value.to_owned());
        }
    }
    blocks
}

async fn run_synctex(tools: &TexTools, root: &Path, args: &[String]) -> ApiResult<String> {
    // A non-zero exit just means "no match": use whatever was printed.
    let out = tool_command(&tools.synctex)
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| ApiError::internal(format!("could not run synctex: {e}")))?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn number_arg(q: &Value, key: &str) -> ApiResult<String> {
    q.get(key)
        .filter(|v| v.is_number())
        .map(|v| v.to_string())
        .ok_or_else(|| ApiError::bad_request(format!("Missing {key}")))
}

/// `compiled_tex` is the file that was compiled; its PDF is `.preview-cache/<same>.pdf`.
/// `query` is the UI's `{ type: "view", texRelativePath, line }` or `{ type: "edit", page, x, y }`.
pub async fn synctex(
    tools: &TexTools,
    project: &Project,
    compiled_tex: &str,
    query: &Value,
) -> ApiResult<Value> {
    let root = project.root();
    let pdf = project.resolve(&format!(
        ".preview-cache/{}.pdf",
        compiled_tex.strip_suffix(".tex").unwrap_or(compiled_tex)
    ))?;
    let pdf = pdf.to_string_lossy().into_owned();

    if query.get("type").and_then(Value::as_str) == Some("edit") {
        // Reverse sync: PDF (page, x, y) -> source file:line.
        let target = format!(
            "{}:{}:{}:{pdf}",
            number_arg(query, "page")?,
            number_arg(query, "x")?,
            number_arg(query, "y")?
        );
        let output = run_synctex(tools, root, &["edit".into(), "-o".into(), target]).await?;
        let block = parse_synctex_output(&output).into_iter().next();
        let Some((input, line)) = block
            .as_ref()
            .and_then(|b| Some((b.get("Input")?, b.get("Line")?)))
        else {
            return Err(ApiError::not_found("No SyncTeX match"));
        };
        let column = block
            .as_ref()
            .and_then(|b| b.get("Column"))
            .and_then(|c| c.parse::<i64>().ok());
        let input = Path::new(input)
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| input.clone());
        return Ok(
            json!({ "input": input, "line": line.parse::<i64>().unwrap_or(0), "column": column.unwrap_or(-1) }),
        );
    }

    // Forward sync: source file:line -> typeset boxes on a PDF page. The CLI only matches
    // the absolute path the compile recorded, so a relative one would find nothing.
    let tex_rel = query
        .get("texRelativePath")
        .and_then(Value::as_str)
        .filter(|p| !p.is_empty())
        .unwrap_or(compiled_tex);
    let tex_abs = project.resolve(tex_rel)?.to_string_lossy().into_owned();
    let line = number_arg(query, "line")?;
    let output = run_synctex(
        tools,
        root,
        &[
            "view".into(),
            "-i".into(),
            format!("{line}:0:{tex_abs}"),
            "-o".into(),
            pdf,
        ],
    )
    .await?;
    let num = |b: &std::collections::HashMap<String, String>, k: &str| {
        b.get(k)
            .and_then(|v| v.parse::<f64>().ok())
            .map_or(Value::Null, |f| json!(f))
    };
    let records: Vec<Value> = parse_synctex_output(&output)
        .iter()
        .filter(|b| b.contains_key("Page"))
        .map(|b| {
            json!({
                "page": b["Page"].parse::<i64>().unwrap_or(0),
                "x": num(b, "x"), "y": num(b, "y"), "h": num(b, "h"), "v": num(b, "v"),
                "W": num(b, "W"), "H": num(b, "H"),
            })
        })
        .collect();
    Ok(json!({ "records": records }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real `synctex view` output captured from the M0 spike (official CLI 1.7).
    const VIEW_OUTPUT: &str = "This is SyncTeX command line utility, version 1.7\n\
        SyncTeX result begin\nOutput:/p/.preview-cache/chapters/x.pdf\nPage:1\nx:174.445831\ny:134.764633\n\
        h:133.768372\nv:134.874207\nW:343.711060\nH:7.023649\nbefore:\noffset:-1\nmiddle:\nafter:\nSyncTeX result end\n";

    #[test]
    fn finds_sidecars_in_the_resource_dir() {
        let res = tempfile::tempdir().unwrap();
        let name = if cfg!(windows) {
            "ss-test-tool.exe"
        } else {
            "ss-test-tool"
        };
        std::fs::create_dir(res.path().join("bin")).unwrap();
        std::fs::write(res.path().join("bin").join(name), "x").unwrap();
        assert_eq!(
            find_tool("ss-test-tool", "SS_TEST_TOOL_NOT_SET", Some(res.path())),
            res.path().join("bin").join(name)
        );
        // Not there: fall back to the bare name for PATH lookup.
        assert_eq!(
            find_tool("ss-test-tool", "SS_TEST_TOOL_NOT_SET", None),
            PathBuf::from(name)
        );
    }

    #[test]
    fn parses_real_synctex_cli_output() {
        let blocks = parse_synctex_output(VIEW_OUTPUT);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0]["Page"], "1");
        assert_eq!(blocks[0]["W"], "343.711060");
        // Windows paths contain `:`; only the first colon splits, so they survive.
        let win = parse_synctex_output("Output:C:\\p\\x.pdf\nInput:C:\\p\\x.tex\nLine:5\n");
        assert_eq!(win[0]["Input"], "C:\\p\\x.tex");
        assert!(parse_synctex_output("SyncTeX Warning: No tag for chapters/x.tex\n").is_empty());
    }

    #[test]
    fn recognizes_tectonics_offline_failures() {
        let offline = "warning: failure fetching \"x.tex\" from network (1/3)\ncaused by: error sending request for url (https://relay.fullyjustified.net/default_bundle_v33.tar)\ncaused by: tcp connect error\n";
        assert!(looks_like_network_failure(offline));
        assert!(looks_like_network_failure(
            "dns error: failed to lookup address information"
        ));
        // A plain LaTeX error must not be blamed on the network.
        assert!(!looks_like_network_failure(
            "error: main.tex:3: Undefined control sequence"
        ));
    }

    #[cfg(unix)]
    mod fake_tools {
        use super::*;
        use std::os::unix::fs::PermissionsExt;

        /// Writes an executable shell script and returns its path.
        pub fn script(dir: &Path, name: &str, body: &str) -> PathBuf {
            let path = dir.join(name);
            std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            path
        }

        /// Behaves like Tectonic: `-C` fails (empty cache), the networked run writes the PDF.
        pub const TECTONIC_RETRY_OK: &str = r#"
echo "$@" >> "$0.log"; pwd >> "$0.log"
if [ "$1" = "-C" ]; then echo "error: failed to open input file" >&2; exit 1; fi
for a in "$@"; do [ "$p" = "--outdir" ] && out="$a"; p="$a"; tex="$a"; done
stem=$(basename "$tex" .tex); mkdir -p "$out"; echo "%PDF-fake" > "$out/$stem.pdf"
echo "note: Writing $out/$stem.pdf"
"#;

        pub async fn collect(mut rx: mpsc::Receiver<Bytes>) -> String {
            let mut all = Vec::new();
            while let Some(chunk) = rx.recv().await {
                all.extend_from_slice(&chunk);
            }
            String::from_utf8(all).unwrap()
        }

        /// A project in a subfolder, so fake tool scripts in the parent stay out of its tree.
        pub fn project(files: &[&str]) -> (tempfile::TempDir, Project) {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().join("proj");
            std::fs::create_dir(&root).unwrap();
            let p = Project::open(root).unwrap();
            for f in files {
                p.write(f, b"\\documentclass{article}").unwrap();
            }
            (dir, p)
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn compile_retries_without_cached_only_and_reports_the_ui_marker() {
        use fake_tools::*;
        let (dir, p) = project(&["chapters/x.tex"]);
        let tectonic = script(dir.path(), "tectonic", TECTONIC_RETRY_OK);
        let tools = Arc::new(TexTools::new(tectonic.clone(), "synctex".into()));

        let log = collect(start_compile(tools, &p, "chapters/./x.tex").unwrap()).await;

        assert!(log.contains("error: failed to open input file"), "{log}");
        assert!(log.contains(
            "[INFO] Cached compilation failed. Retrying with remote package fetching..."
        ));
        assert!(
            log.trim_end().ends_with("[SUCCESS] chapters/x.pdf"),
            "{log}"
        );
        assert!(p.root().join(".preview-cache/chapters/x.pdf").is_file());

        let calls = std::fs::read_to_string(format!("{}.log", tectonic.display())).unwrap();
        let lines: Vec<_> = calls.lines().collect();
        let (outdir, tex) = (
            p.root().join(".preview-cache/chapters"),
            p.root().join("chapters/x.tex"),
        );
        assert_eq!(
            lines[0],
            format!(
                "-C --synctex --outdir {} {}",
                outdir.display(),
                tex.display()
            )
        );
        assert_eq!(
            lines[1],
            p.root().display().to_string(),
            "runs with the project as cwd"
        );
        assert_eq!(
            lines[2],
            format!("--synctex --outdir {} {}", outdir.display(), tex.display())
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn compile_failure_and_missing_engine_are_reported_not_hidden() {
        use fake_tools::*;
        let (dir, p) = project(&["main.tex"]);

        let failing = script(
            dir.path(),
            "failing",
            "echo 'error: main.tex:3: Undefined control sequence' >&2; exit 2",
        );
        let log = collect(
            start_compile(Arc::new(TexTools::new(failing, "x".into())), &p, "main.tex").unwrap(),
        )
        .await;
        assert!(log.contains("error: main.tex:3: Undefined control sequence"));
        assert!(
            log.trim_end()
                .ends_with("[ERROR] Tectonic exited with code 2"),
            "{log}"
        );
        assert!(!log.contains("[SUCCESS]") && !log.contains("[NETWORK]"));

        let offline = script(
            dir.path(),
            "offline",
            "echo 'warning: failure fetching \"a\" from network (3/3)' >&2; exit 1",
        );
        let log = collect(
            start_compile(Arc::new(TexTools::new(offline, "x".into())), &p, "main.tex").unwrap(),
        )
        .await;
        assert!(
            log.contains("[NETWORK] Couldn't download the LaTeX packages"),
            "{log}"
        );
        assert!(
            log.trim_end()
                .ends_with("[ERROR] Tectonic exited with code 1")
        );

        let missing = Arc::new(TexTools::new(
            dir.path().join("no-such-tectonic"),
            "x".into(),
        ));
        let log = collect(start_compile(missing, &p, "main.tex").unwrap()).await;
        assert!(log.contains("[ERROR] Failed to start Tectonic:"), "{log}");
        assert!(
            !log.contains("Retrying"),
            "a missing engine must not trigger the retry path"
        );

        let no_pdf = script(dir.path(), "nopdf", "exit 0");
        let log = collect(
            start_compile(Arc::new(TexTools::new(no_pdf, "x".into())), &p, "main.tex").unwrap(),
        )
        .await;
        assert!(
            log.contains("[ERROR] Tectonic finished but produced no PDF"),
            "{log}"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropping_the_stream_kills_tectonic_and_frees_the_queue() {
        use fake_tools::*;
        let (dir, p) = project(&["main.tex"]);
        let hang = script(dir.path(), "hang", "echo started; exec sleep 60");
        let tools = Arc::new(TexTools::new(hang, "x".into()));

        let mut rx = start_compile(tools.clone(), &p, "main.tex").unwrap();
        assert_eq!(&rx.recv().await.unwrap()[..], b"started\n");
        assert_eq!(tools.gate.available_permits(), 0);
        drop(rx); // the UI aborted the request

        tokio::time::timeout(Duration::from_secs(5), async {
            while tools.gate.available_permits() == 0 {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("compile slot must be released after the client disconnects");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_hung_attempt_times_out() {
        use fake_tools::*;
        let (dir, p) = project(&["main.tex"]);
        let hang = script(dir.path(), "hang", "exec sleep 60");
        let mut tools = TexTools::new(hang, "x".into());
        tools.attempt_timeout = Duration::from_millis(200);
        let log = collect(start_compile(Arc::new(tools), &p, "main.tex").unwrap()).await;
        assert!(log.contains("[ERROR] Compilation timed out"), "{log}");
    }

    #[tokio::test]
    async fn compile_rejects_bad_requests_before_spawning_anything() {
        let dir = tempfile::tempdir().unwrap();
        let p = Project::open(dir.path().to_path_buf()).unwrap();
        p.write("notes.txt", b"x").unwrap();
        let tools = Arc::new(TexTools::new("never-run".into(), "never-run".into()));
        let err = |path: &str| start_compile(tools.clone(), &p, path).unwrap_err();
        assert_eq!(err("notes.txt").message, "Only .tex files can be compiled");
        assert_eq!(err("missing.tex").status, axum::http::StatusCode::NOT_FOUND);
        assert_eq!(
            err("../escape.tex").status,
            axum::http::StatusCode::BAD_REQUEST
        );
        assert_eq!(
            err("/etc/x.tex").status,
            axum::http::StatusCode::BAD_REQUEST
        );
    }

    /// Real Tectonic + SyncTeX, no fakes. Ignored by default (needs the binaries, and a warm
    /// Tectonic cache or network): `TECTONIC_BIN=... SYNCTEX_BIN=... cargo test -- --ignored real_`.
    #[tokio::test]
    #[ignore = "needs real tectonic and synctex binaries"]
    async fn real_tectonic_and_synctex_round_trip() {
        let tools = Arc::new(TexTools::locate(None));
        let dir = tempfile::tempdir().unwrap();
        let p = Project::open(dir.path().to_path_buf()).unwrap();
        p.write(
            "chapters/x.tex",
            b"\\documentclass{article}\n\\begin{document}\nHello nested world.\n\nSecond paragraph.\n\\end{document}\n",
        )
        .unwrap();

        let rx = start_compile(tools.clone(), &p, "chapters/x.tex").unwrap();
        let mut log = Vec::new();
        let mut rx = rx;
        while let Some(chunk) = rx.recv().await {
            log.extend_from_slice(&chunk);
        }
        let log = String::from_utf8_lossy(&log);
        assert!(
            log.trim_end().ends_with("[SUCCESS] chapters/x.pdf"),
            "{log}"
        );
        let pdf = std::fs::read(p.root().join(".preview-cache/chapters/x.pdf")).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
        assert!(
            p.root()
                .join(".preview-cache/chapters/x.synctex.gz")
                .is_file()
        );

        let view = synctex(
            &tools,
            &p,
            "chapters/x.tex",
            &json!({ "type": "view", "texRelativePath": "chapters/x.tex", "line": 3 }),
        )
        .await
        .unwrap();
        let records = view["records"].as_array().unwrap();
        assert!(!records.is_empty(), "forward search found nothing: {view}");
        assert_eq!(records[0]["page"], 1);

        let edit = synctex(
            &tools,
            &p,
            "chapters/x.tex",
            &json!({ "type": "edit", "page": 1, "x": 100, "y": 150 }),
        )
        .await
        .unwrap();
        assert_eq!(edit["input"], "chapters/x.tex");
        assert!(edit["line"].as_i64().unwrap() >= 3);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn synctex_view_and_edit_shape_the_cli_output_for_the_ui() {
        use fake_tools::*;
        let (dir, p) = project(&["chapters/x.tex"]);
        let root = p.root().display().to_string();
        // Echo the args to a file, then answer like the real CLI.
        let fake = script(
            dir.path(),
            "synctex",
            &format!(
                r#"echo "$@" >> "$0.log"
if [ "$1" = "view" ]; then cat <<'EOF'
SyncTeX result begin
Output:/p/x.pdf
Page:2
x:10.5
y:20
h:1
v:2
W:3
H:4
Output:/p/x.pdf
Page:2
x:11
y:21
h:1
v:2
W:3
H:4
SyncTeX result end
EOF
else cat <<'EOF'
SyncTeX result begin
Output:/p/x.pdf
Input:{root}/chapters/x.tex
Line:5
Column:-1
SyncTeX result end
EOF
fi"#
            ),
        );
        let tools = TexTools::new("x".into(), fake.clone());

        let view = synctex(
            &tools,
            &p,
            "chapters/x.tex",
            &json!({ "type": "view", "texRelativePath": "chapters/x.tex", "line": 7 }),
        )
        .await
        .unwrap();
        assert_eq!(view["records"].as_array().unwrap().len(), 2);
        assert_eq!(
            view["records"][0],
            json!({ "page": 2, "x": 10.5, "y": 20.0, "h": 1.0, "v": 2.0, "W": 3.0, "H": 4.0 })
        );

        let edit = synctex(
            &tools,
            &p,
            "chapters/x.tex",
            &json!({ "type": "edit", "page": 1, "x": 100.5, "y": 150 }),
        )
        .await
        .unwrap();
        assert_eq!(
            edit,
            json!({ "input": "chapters/x.tex", "line": 5, "column": -1 })
        );

        let calls = std::fs::read_to_string(format!("{}.log", fake.display())).unwrap();
        let pdf = p.root().join(".preview-cache/chapters/x.pdf");
        let tex = p.root().join("chapters/x.tex");
        assert_eq!(
            calls.lines().next().unwrap(),
            format!("view -i 7:0:{} -o {}", tex.display(), pdf.display())
        );
        assert_eq!(
            calls.lines().nth(1).unwrap(),
            format!("edit -o 1:100.5:150:{}", pdf.display())
        );

        let none = script(dir.path(), "silent", "echo 'SyncTeX Warning: nothing'");
        let tools = TexTools::new("x".into(), none);
        let err = synctex(
            &tools,
            &p,
            "chapters/x.tex",
            &json!({ "type": "edit", "page": 1, "x": 1, "y": 1 }),
        )
        .await
        .unwrap_err();
        assert_eq!(
            (err.status, err.message.as_str()),
            (axum::http::StatusCode::NOT_FOUND, "No SyncTeX match")
        );
        let view = synctex(&tools, &p, "chapters/x.tex", &json!({ "line": 1 }))
            .await
            .unwrap();
        assert_eq!(view, json!({ "records": [] }));
    }
}
