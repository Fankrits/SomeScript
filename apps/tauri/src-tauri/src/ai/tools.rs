//! The tools the assistant can call, run against the open project's folder.
//!
//! These are ports of the cloud assistant's tools (`apps/editor/agent/tools/*`) with the same
//! names (underscored, which every provider accepts), arguments and model-facing wording, so the
//! prompt and the behaviour carry over. Every path goes through `Project::resolve`, so a model
//! can't leave the project (`..`, absolute paths, symlinks), and the app's own folders
//! (`.somescript`, `.git`, `.preview-cache`, ...) are off limits.
//!
//! Each call yields two views of the result: `model` is the short text the model reads, `ui` is
//! the structured JSON the chat renders (diffs, file lists, compile errors).

use super::protocol::{ToolCall, ToolSpec};
use crate::{
    api::{meta, search},
    error::{ApiError, ApiResult, blocking},
    storage::{Project, content_version, is_binary_content, is_excluded},
    tex::{self, TexTools},
};
use globset::GlobBuilder;
use regex::Regex;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
};

/// Same budget as the cloud tool: ~40k characters is ~10k tokens.
const MAX_READ_CHARS: usize = 40_000;
const MAX_LISTED_FILES: usize = 400;
const MAX_GREP_MATCHES: usize = 200;
const MAX_MATCH_LINE_CHARS: usize = 200;
const MAX_WRITE_BYTES: usize = 2 * 1024 * 1024;
/// Above this the UI result carries no before/after text (so no diff and no undo).
const MAX_SNAPSHOT_CHARS: usize = 200_000;
const MAX_MODEL_LOG_CHARS: usize = 4000;
const MAX_UI_LOG_CHARS: usize = 20_000;
const MAX_TODOS: usize = 50;

pub struct Outcome {
    pub ok: bool,
    pub ui: Value,
    pub model: String,
}

impl Outcome {
    fn fail(path: Option<&str>, message: impl Into<String>) -> Self {
        let message = message.into();
        let mut ui = json!({ "ok": false, "error": message });
        if let Some(p) = path {
            ui["path"] = json!(p);
        }
        Self {
            ok: false,
            ui,
            model: format!("Error: {message}"),
        }
    }
}

pub struct ToolEnv {
    project: Project,
    tex: Arc<TexTools>,
    /// Content hash of each file as this run last saw it, for the "changed under you" guard.
    seen: Mutex<HashMap<String, String>>,
}

impl ToolEnv {
    pub fn new(project: Project, tex: Arc<TexTools>) -> Self {
        Self {
            project,
            tex,
            seen: Mutex::new(HashMap::new()),
        }
    }

    fn remember(&self, path: &str, content: &str) {
        self.seen
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(path.to_owned(), content_version(content));
    }

    fn seen_version(&self, path: &str) -> Option<String> {
        self.seen
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(path)
            .cloned()
    }

    pub async fn execute(&self, call: &ToolCall) -> Outcome {
        if let Some(e) = &call.args_error {
            return Outcome::fail(None, e.clone());
        }
        let a = &call.args;
        match call.name.as_str() {
            "list_files" => self.list_files(a).await,
            "read_file" => self.read_file(a).await,
            "grep" => self.grep(a).await,
            "edit_file" => self.edit_file(a).await,
            "write_file" => self.write_file(a).await,
            "delete_file" => self.delete_file(a).await,
            "move_file" => self.move_file(a).await,
            "compile_project" => self.compile(a).await,
            "todo_write" => todo_write(a),
            other => Outcome::fail(None, format!("There is no tool called \"{other}\".")),
        }
    }

    async fn list_files(&self, a: &Value) -> Outcome {
        let pattern = str_arg(a, "pattern").filter(|p| !p.trim().is_empty());
        let project = self.project.clone();
        let matcher = match pattern.as_deref().map(compile_glob).transpose() {
            Ok(m) => m,
            Err(e) => return Outcome::fail(None, e),
        };
        let listed = blocking(move || {
            let mut all = Vec::new();
            flatten(&project.list_tree()?, &mut all);
            Ok(all)
        })
        .await;
        let all = match listed {
            Ok(all) => all,
            Err(e) => return Outcome::fail(None, e.message),
        };
        if all.is_empty() {
            return Outcome {
                ok: true,
                ui: json!({ "ok": true, "files": [], "total": 0, "truncated": false }),
                model: "The project workspace is empty.".into(),
            };
        }
        let files: Vec<String> = match &matcher {
            Some(m) => all
                .iter()
                .filter(|f| m.is_match(f.as_str()))
                .cloned()
                .collect(),
            None => all.clone(),
        };
        if files.is_empty() {
            let p = pattern.unwrap_or_default();
            let hint = if p.starts_with("**/") {
                String::new()
            } else {
                format!(" try \"**/{p}\" ('*' does not match across folders), or")
            };
            return Outcome {
                ok: true,
                ui: json!({ "ok": true, "pattern": p, "files": [], "total": 0, "truncated": false }),
                model: format!(
                    "No files match \"{p}\". The project has {} file{} —{hint} omit pattern to see everything.",
                    all.len(),
                    if all.len() == 1 { "" } else { "s" }
                ),
            };
        }
        let total = files.len();
        let shown: Vec<&String> = files.iter().take(MAX_LISTED_FILES).collect();
        let header = match &pattern {
            Some(p) => format!("Files matching \"{p}\":"),
            None => "Files in the project workspace:".to_owned(),
        };
        let mut model = format!(
            "{header}\n{}",
            shown
                .iter()
                .map(|f| format!("- {f}"))
                .collect::<Vec<_>>()
                .join("\n")
        );
        if total > shown.len() {
            model.push_str(&format!(
                "\n\n({} more not shown — pass pattern to narrow the list)",
                total - shown.len()
            ));
        }
        Outcome {
            ok: true,
            ui: json!({ "ok": true, "pattern": pattern, "files": shown, "total": total, "truncated": total > shown.len() }),
            model,
        }
    }

    async fn read_file(&self, a: &Value) -> Outcome {
        let Some(path) = str_arg_any(a, PATH_KEYS) else {
            return missing_args("read_file", "path is", r#"{"path": "main.tex"}"#, a);
        };
        if let Err(e) = guard_path(&path) {
            return Outcome::fail(Some(&path), e);
        }
        let (offset, limit) = (uint_arg(a, "offset"), uint_arg(a, "limit"));
        let project = self.project.clone();
        let p = path.clone();
        let read = blocking(move || {
            let full = project.resolve(&p)?;
            if full.is_dir() {
                return Err(ApiError::bad_request(
                    "That is a folder, not a file. Use list_files.",
                ));
            }
            project.read_bytes(&p)
        })
        .await;
        let bytes = match read {
            Ok(b) => b,
            Err(e) => return Outcome::fail(Some(&path), friendly(&e, &path)),
        };
        if is_binary_content(&bytes) {
            return Outcome::fail(
                Some(&path),
                format!(
                    "{path} is a binary file ({} bytes); it can't be read as text.",
                    bytes.len()
                ),
            );
        }
        let content = String::from_utf8_lossy(&bytes).into_owned();
        // Record the whole file, not the slice, so a ranged read still arms the stale-write guard.
        self.remember(&path, &content);

        let all: Vec<&str> = content.split('\n').collect();
        let start = offset
            .map_or(0, |o| o.saturating_sub(1))
            .min(all.len().saturating_sub(1));
        let end = limit.map_or(all.len(), |l| (start + l).min(all.len()));
        let mut budget = MAX_READ_CHARS as i64;
        let mut truncated = end < all.len();
        let mut slice: Vec<&str> = Vec::new();
        for line in &all[start..end] {
            budget -= line.chars().count() as i64 + 1;
            if budget < 0 && !slice.is_empty() {
                truncated = true;
                break;
            }
            slice.push(line);
        }
        let first = start + 1;
        let last = start + slice.len();
        let numbered = slice
            .iter()
            .enumerate()
            .map(|(i, l)| format!("{:>6}→{l}", first + i))
            .collect::<Vec<_>>()
            .join("\n");
        let whole = first == 1 && last == all.len();
        let header = if whole {
            String::new()
        } else {
            format!("{path} (lines {first}-{last} of {})\n", all.len())
        };
        let tail = if truncated {
            format!(
                "\n\n[truncated — {} more lines. Call read_file again with offset={}.]",
                all.len() - last,
                last + 1
            )
        } else {
            String::new()
        };
        Outcome {
            ok: true,
            ui: json!({
                "ok": true, "path": path, "firstLine": first, "lastLine": last,
                "totalLines": all.len(), "truncated": truncated,
            }),
            model: format!("{header}{numbered}{tail}"),
        }
    }

    async fn grep(&self, a: &Value) -> Outcome {
        let Some(query) = str_arg(a, "query").filter(|q| !q.is_empty()) else {
            return Outcome::fail(None, "query is required.");
        };
        let glob = str_arg(a, "path").filter(|p| !p.trim().is_empty());
        let matcher = match glob.as_deref().map(compile_glob).transpose() {
            Ok(m) => m,
            Err(e) => return Outcome::fail(None, e),
        };
        let re = match search::build_pattern(
            &query,
            bool_arg(a, "matchCase"),
            false,
            bool_arg(a, "useRegex"),
        ) {
            Ok(re) => re,
            Err(e) => return Outcome::fail(None, e.message),
        };
        let project = self.project.clone();
        let found =
            blocking(move || search::search_files(&project, &re, None, None, None, 2000)).await;
        let mut matches = match found {
            Ok(m) => m,
            Err(e) => return Outcome::fail(None, e.message),
        };
        if let Some(m) = &matcher {
            matches.retain(|x| m.is_match(x.path.as_str()));
        }
        let total = matches.len();
        let truncated = total > MAX_GREP_MATCHES;
        matches.truncate(MAX_GREP_MATCHES);
        if matches.is_empty() {
            return Outcome {
                ok: true,
                ui: json!({ "ok": true, "query": query, "matches": [], "truncated": false }),
                model: format!("No matches for \"{query}\"."),
            };
        }
        let mut files: Vec<&str> = matches.iter().map(|m| m.path.as_str()).collect();
        files.sort_unstable();
        files.dedup();
        let lines = matches
            .iter()
            .map(|m| {
                format!(
                    "{}:{}:{}  {}",
                    m.path,
                    m.line,
                    m.column + 1,
                    clip_around(&m.text, m.column).trim()
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let tail = if truncated {
            format!("\n\n(stopped at {MAX_GREP_MATCHES} matches — narrow the query or pass path)")
        } else {
            String::new()
        };
        Outcome {
            ok: true,
            ui: json!({
                "ok": true, "query": query, "truncated": truncated,
                "matches": matches.iter().map(|m| json!({
                    "path": m.path, "line": m.line, "column": m.column + 1,
                    "text": clip_around(&m.text, m.column).trim(),
                })).collect::<Vec<_>>(),
            }),
            model: format!(
                "{} match{} in {} file{} for \"{query}\".\n\n{lines}{tail}",
                matches.len(),
                if matches.len() == 1 { "" } else { "es" },
                files.len(),
                if files.len() == 1 { "" } else { "s" },
            ),
        }
    }

    async fn edit_file(&self, a: &Value) -> Outcome {
        let Some(path) = str_arg_any(a, PATH_KEYS) else {
            return missing_args(
                "edit_file",
                "path is",
                r#"{"path": "main.tex", "oldText": "text to replace", "newText": "replacement"}"#,
                a,
            );
        };
        if let Err(e) = guard_path(&path) {
            return Outcome::fail(Some(&path), e);
        }
        let old = str_arg_any(a, OLD_TEXT_KEYS).unwrap_or_default();
        let new = str_arg_any(a, NEW_TEXT_KEYS).unwrap_or_default();
        let project = self.project.clone();
        let p = path.clone();
        // Read, splice and write in one blocking step: whatever the user typed while the model
        // was thinking is already in `before`, so there is no window to guard.
        let edited = blocking(move || {
            let before = read_text_checked(&project, &p)?;
            let after = match apply_exact_edit(&before, &old, &new) {
                Ok(edit) => edit,
                Err(reason) => return Ok(Err(reason.message(&p))),
            };
            ensure_size(&after.text)?;
            project.write(&p, after.text.as_bytes())?;
            project.touch();
            Ok(Ok((before, after)))
        })
        .await;
        match edited {
            Err(e) => Outcome::fail(Some(&path), friendly(&e, &path)),
            Ok(Err(message)) => Outcome::fail(Some(&path), message),
            Ok(Ok((before, after))) => {
                self.remember(&path, &after.text);
                Outcome {
                    ok: true,
                    ui: json!({
                        "ok": true, "path": path, "created": false, "line": after.line,
                        "before": snapshot(&before), "after": snapshot(&after.text),
                    }),
                    model: format!("Edited {path} — replaced 1 block at line {}.", after.line),
                }
            }
        }
    }

    async fn write_file(&self, a: &Value) -> Outcome {
        let Some(path) = str_arg_any(a, PATH_KEYS) else {
            return missing_args(
                "write_file",
                "path is",
                r#"{"path": "notes.tex", "content": "the whole file"}"#,
                a,
            );
        };
        if let Err(e) = guard_path(&path) {
            return Outcome::fail(Some(&path), e);
        }
        let Some(content) = str_arg_any(a, CONTENT_KEYS) else {
            return Outcome::fail(
                Some(&path),
                r#"content is required. Call write_file with {"path": "notes.tex", "content": "the whole file"}."#,
            );
        };
        if let Err(e) = ensure_size(&content) {
            return Outcome::fail(Some(&path), e.message);
        }
        let expected = self.seen_version(&path);
        let project = self.project.clone();
        let p = path.clone();
        let c = content.clone();
        let written = blocking(move || {
            let full = project.resolve(&p)?;
            if full.is_dir() {
                return Err(ApiError::bad_request("That path is a folder."));
            }
            let before = match project.read_bytes(&p) {
                Ok(b) if is_binary_content(&b) => {
                    return Err(ApiError::bad_request(
                        "That file is binary; writing text over it would destroy it.",
                    ));
                }
                Ok(b) => Some(String::from_utf8_lossy(&b).into_owned()),
                Err(e) if e.status == axum::http::StatusCode::NOT_FOUND => None,
                Err(e) => return Err(e),
            };
            // Someone (the user, in the editor) changed the file since this run read it.
            if let (Some(expected), Some(before)) = (&expected, &before)
                && content_version(before) != *expected
            {
                return Ok(Err(format!(
                    "{p} changed since you read it — the user may be editing it live. Read it again, re-apply your change to the current content, then write."
                )));
            }
            project.write(&p, c.as_bytes())?;
            project.touch();
            Ok(Ok(before))
        })
        .await;
        match written {
            Err(e) => Outcome::fail(Some(&path), friendly(&e, &path)),
            Ok(Err(message)) => {
                let mut o = Outcome::fail(Some(&path), message);
                o.ui["stale"] = json!(true);
                o
            }
            Ok(Ok(before)) => {
                self.remember(&path, &content);
                let created = before.is_none();
                Outcome {
                    ok: true,
                    ui: json!({
                        "ok": true, "path": path, "created": created,
                        "before": before.as_deref().and_then(snapshot), "after": snapshot(&content),
                    }),
                    model: format!("Successfully updated file: {path}"),
                }
            }
        }
    }

    async fn delete_file(&self, a: &Value) -> Outcome {
        let Some(path) = str_arg_any(a, PATH_KEYS) else {
            return missing_args("delete_file", "path is", r#"{"path": "old.tex"}"#, a);
        };
        if let Err(e) = guard_path(&path) {
            return Outcome::fail(Some(&path), e);
        }
        let project = self.project.clone();
        let p = path.clone();
        let deleted = blocking(move || {
            let full = project.resolve(&p)?;
            if full.is_dir() {
                return Ok(Err(format!(
                    "{p} is a folder. delete_file removes files only; list the folder's files and delete them one by one."
                )));
            }
            let bytes = project.read_bytes(&p)?;
            let before = (!is_binary_content(&bytes))
                .then(|| String::from_utf8_lossy(&bytes).into_owned());
            project.delete_path(&p)?;
            project.touch();
            Ok(Ok(before))
        })
        .await;
        match deleted {
            Err(e) => Outcome::fail(Some(&path), friendly(&e, &path)),
            Ok(Err(message)) => Outcome::fail(Some(&path), message),
            Ok(Ok(before)) => Outcome {
                ok: true,
                ui: json!({ "ok": true, "path": path, "before": before.as_deref().and_then(snapshot) }),
                model: format!("Deleted {path}"),
            },
        }
    }

    async fn move_file(&self, a: &Value) -> Outcome {
        let (Some(from), Some(to)) = (str_arg_any(a, FROM_KEYS), str_arg_any(a, TO_KEYS)) else {
            return missing_args(
                "move_file",
                "from and to are",
                r#"{"from": "old.tex", "to": "new.tex"}"#,
                a,
            );
        };
        for p in [&from, &to] {
            if let Err(e) = guard_path(p) {
                return Outcome::fail(Some(p.as_str()), e);
            }
        }
        let project = self.project.clone();
        let (f, t) = (from.clone(), to.clone());
        let moved = blocking(move || {
            if !project.resolve(&f)?.exists() {
                return Ok(Err(format!("{f} does not exist.")));
            }
            if project.resolve(&t)?.exists() {
                return Ok(Err(format!("{t} already exists; pick another name.")));
            }
            project.move_path(&f, &t)?;
            project.touch();
            Ok(Ok(()))
        })
        .await;
        match moved {
            Err(e) => Outcome::fail(Some(&from), friendly(&e, &from)),
            Ok(Err(message)) => Outcome::fail(Some(&from), message),
            Ok(Ok(())) => Outcome {
                ok: true,
                ui: json!({ "ok": true, "from": from, "to": to }),
                model: format!("Moved {from} to {to}"),
            },
        }
    }

    async fn compile(&self, a: &Value) -> Outcome {
        let requested = str_arg(a, "path")
            .map(|p| p.trim().to_owned())
            .filter(|p| !p.is_empty());
        let project = self.project.clone();
        let path = match requested {
            Some(p) => p,
            None => {
                let pr = project.clone();
                match blocking(move || Ok(meta::main_file_path(&pr))).await {
                    Ok(p) => p,
                    Err(e) => return Outcome::fail(None, e.message),
                }
            }
        };
        if let Err(e) = guard_path(&path) {
            return Outcome::fail(Some(&path), e);
        }
        let mut rx = match tex::start_compile(self.tex.clone(), &project, &path) {
            Ok(rx) => rx,
            Err(e) => return Outcome::fail(Some(&path), friendly(&e, &path)),
        };
        let mut log = Vec::new();
        while let Some(chunk) = rx.recv().await {
            log.extend_from_slice(&chunk);
        }
        let log = String::from_utf8_lossy(&log).into_owned();
        let pdf_path = log
            .lines()
            .rev()
            .find_map(|l| l.strip_prefix("[SUCCESS] "))
            .map(|p| {
                format!(
                    ".preview-cache/{}",
                    p.trim().trim_start_matches(".preview-cache/")
                )
            });
        let ok = pdf_path.is_some();
        let errors = parse_compile_errors(&log, &path);
        let model = if ok && errors.is_empty() {
            format!("Compiled {path} successfully.")
        } else {
            format!(
                "{} {path}.\n\n{}",
                if ok {
                    "Compiled with warnings:"
                } else {
                    "Compile FAILED for"
                },
                format_compile_for_model(&errors, &log)
            )
        };
        Outcome {
            ok,
            ui: json!({
                "ok": ok, "path": path, "pdfPath": pdf_path,
                "errors": errors.iter().map(|e| json!({ "file": e.file, "line": e.line, "message": e.message })).collect::<Vec<_>>(),
                "log": tail_chars(&log, MAX_UI_LOG_CHARS),
            }),
            model,
        }
    }
}

// ---- tool schemas ------------------------------------------------------------------------

pub fn specs() -> Vec<ToolSpec> {
    let spec = |name: &str, description: &str, schema: Value| ToolSpec {
        name: name.into(),
        description: description.into(),
        schema,
    };
    let path = json!({ "type": "string", "description": "Relative path to the file from the project root" });
    let glob_help = "Optional glob matched against each file's full project-relative path. '*' does not cross '/', so use '**/*.tex' for every .tex at any depth, 'chapters/*.tex' for one folder, '**/*.{tex,bib}' for several extensions.";
    vec![
        spec(
            "list_files",
            "Lists the files in the project recursively, optionally filtered by a glob pattern. Run this first if you do not know which files exist.",
            json!({ "type": "object", "properties": { "pattern": { "type": "string", "description": glob_help } } }),
        ),
        spec(
            "read_file",
            "Reads a file from the project and returns it with line numbers. Use offset/limit to read part of a large file instead of all of it.",
            json!({
                "type": "object",
                "properties": {
                    "path": path,
                    "offset": { "type": "integer", "minimum": 1, "description": "1-based line number to start reading from. Omit to start at line 1. Use the line number grep reported." },
                    "limit": { "type": "integer", "minimum": 1, "description": "How many lines to read starting at offset. Omit to read to the end of the file." },
                },
                "required": ["path"],
            }),
        ),
        spec(
            "grep",
            "Searches the text of every file in the project for a string or regex and returns each match as path:line:column. Use this instead of reading files one by one when you need to find where something is defined or used: a \\label, a \\cite key, a macro, a package option, a phrase.",
            json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The text to search for. Treated literally unless useRegex is true." },
                    "path": { "type": "string", "description": glob_help },
                    "useRegex": { "type": "boolean", "description": "Treat query as a regular expression. Default false." },
                    "matchCase": { "type": "boolean", "description": "Case-sensitive search. Default false." },
                },
                "required": ["query"],
            }),
        ),
        spec(
            "edit_file",
            "Replaces one exact block of text in a file, leaving the rest untouched. Use this instead of write_file for any change to an existing file: it is faster, cheaper, and cannot clobber edits the user is making elsewhere in the file.",
            json!({
                "type": "object",
                "properties": {
                    "path": path,
                    "oldText": { "type": "string", "description": "The exact text to replace, copied verbatim from read_file output WITHOUT the '  42→' line-number prefixes. Must appear exactly once in the file: include enough surrounding lines to make it unique." },
                    "newText": { "type": "string", "description": "The replacement text. Pass an empty string to delete oldText." },
                },
                "required": ["path", "oldText", "newText"],
            }),
        ),
        spec(
            "write_file",
            "Creates a new file, or replaces a file wholesale, with the complete content given. For any change to an existing file use edit_file instead.",
            json!({
                "type": "object",
                "properties": { "path": path, "content": { "type": "string", "description": "The complete file content to write" } },
                "required": ["path", "content"],
            }),
        ),
        spec(
            "delete_file",
            "Deletes one file from the project (not a folder). Confirm with the user first unless they asked for it.",
            json!({ "type": "object", "properties": { "path": path }, "required": ["path"] }),
        ),
        spec(
            "move_file",
            "Renames a file or moves it to a different folder inside the project.",
            json!({
                "type": "object",
                "properties": {
                    "from": { "type": "string", "description": "Current relative path" },
                    "to": { "type": "string", "description": "New relative path" },
                },
                "required": ["from", "to"],
            }),
        ),
        spec(
            "compile_project",
            "Compiles the LaTeX project with Tectonic and returns the compile log plus each error's file and line. This is the same compile as the user's Compile button and it refreshes their PDF preview. Use it when the user asks to compile, and once after fixing a compile error to verify the fix. Do not compile after ordinary content edits.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Project-relative .tex file to compile as the root document, e.g. 'main.tex' or 'chapters/intro.tex'. Omit to compile the project's configured root document. Use the [openFile: ...] marker when the user says 'this file'." },
                },
            }),
        ),
        spec(
            "todo_write",
            "Keeps a short checklist of the steps of a multi-step task, shown to the user as live progress. Send the complete list every time (it replaces the previous one) and mark steps in_progress / completed as you go. Skip it for simple one-step requests.",
            json!({
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": { "type": "string", "description": "What the step is, in the imperative." },
                                "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] },
                            },
                            "required": ["content", "status"],
                        },
                    },
                },
                "required": ["todos"],
            }),
        ),
    ]
}

// ---- helpers -------------------------------------------------------------------------------

fn todo_write(a: &Value) -> Outcome {
    let Some(items) = a.get("todos").and_then(Value::as_array) else {
        return Outcome::fail(None, "todos must be an array of { content, status }.");
    };
    let todos: Vec<Value> = items
        .iter()
        .filter_map(|t| {
            let content = t.get("content").and_then(Value::as_str)?.trim();
            if content.is_empty() {
                return None;
            }
            let status = t
                .get("status")
                .and_then(Value::as_str)
                .filter(|s| matches!(*s, "pending" | "in_progress" | "completed"))
                .unwrap_or("pending");
            Some(json!({ "content": content.chars().take(300).collect::<String>(), "status": status }))
        })
        .take(MAX_TODOS)
        .collect();
    Outcome {
        ok: true,
        ui: json!({ "ok": true, "todos": todos }),
        model: "Todo list updated. Continue with the next step.".into(),
    }
}

fn str_arg(a: &Value, key: &str) -> Option<String> {
    a.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// The first of `keys` that holds a string. Models trained on other tools' schemas send those
/// names (`file_path`, `old_string`, ...); accepting them beats looping on "path is required".
fn str_arg_any(a: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| str_arg(a, k))
}

const PATH_KEYS: &[&str] = &[
    "path",
    "file_path",
    "filePath",
    "filepath",
    "file",
    "filename",
    "file_name",
    "target_file",
];
const OLD_TEXT_KEYS: &[&str] = &["oldText", "old_text", "old_string", "oldString", "old_str"];
const NEW_TEXT_KEYS: &[&str] = &["newText", "new_text", "new_string", "newString", "new_str"];
const CONTENT_KEYS: &[&str] = &["content", "contents", "file_text", "file_content", "text"];
const FROM_KEYS: &[&str] = &["from", "source", "src", "old_path", "oldPath", "from_path"];
const TO_KEYS: &[&str] = &[
    "to",
    "destination",
    "dest",
    "new_path",
    "newPath",
    "to_path",
];

/// A missing-argument error that shows the model what to send and what it sent, so it can fix
/// the call instead of repeating it.
fn missing_args(tool: &str, what: &str, example: &str, a: &Value) -> Outcome {
    let sent = a
        .as_object()
        .map(|o| o.keys().map(|k| format!("\"{k}\"")).collect::<Vec<_>>())
        .unwrap_or_default();
    let sent = if sent.is_empty() {
        "none (the arguments arrived empty)".to_owned()
    } else {
        sent.join(", ")
    };
    Outcome::fail(
        None,
        format!(
            "{what} required. Call {tool} with a JSON object like {example}. Arguments received: {sent}."
        ),
    )
}

/// Models sometimes send numbers as strings.
fn uint_arg(a: &Value, key: &str) -> Option<usize> {
    match a.get(key)? {
        Value::Number(n) => n.as_u64().map(|n| n as usize),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
    .filter(|n| *n > 0)
}

fn bool_arg(a: &Value, key: &str) -> bool {
    match a.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => s.eq_ignore_ascii_case("true"),
        _ => false,
    }
}

/// Keeps the model inside the project's own files: no app folders, no hidden-tmp files.
fn guard_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("path is required.".into());
    }
    if path.split('/').any(is_excluded) {
        return Err(format!("{path} is not available to the assistant."));
    }
    Ok(())
}

/// A user-fixable message instead of the HTTP-flavoured one.
fn friendly(e: &ApiError, path: &str) -> String {
    match e.message.as_str() {
        "File not found" => format!("{path} does not exist."),
        "Directory traversal attempt detected" | "Invalid path" => {
            format!("{path} is outside the project.")
        }
        other => other.to_owned(),
    }
}

fn ensure_size(text: &str) -> ApiResult<()> {
    if text.len() > MAX_WRITE_BYTES {
        return Err(ApiError::bad_request(format!(
            "That file would be {} MB; the assistant writes up to {} MB at a time.",
            text.len() / (1024 * 1024),
            MAX_WRITE_BYTES / (1024 * 1024)
        )));
    }
    Ok(())
}

fn read_text_checked(project: &Project, path: &str) -> ApiResult<String> {
    let full = project.resolve(path)?;
    if full.is_dir() {
        return Err(ApiError::bad_request("That is a folder, not a file."));
    }
    let bytes = project.read_bytes(path)?;
    if is_binary_content(&bytes) {
        return Err(ApiError::bad_request(
            "That is a binary file; it can't be edited as text.",
        ));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn snapshot(text: &str) -> Option<String> {
    (text.chars().count() <= MAX_SNAPSHOT_CHARS).then(|| text.to_owned())
}

fn flatten(nodes: &[crate::storage::FileNode], out: &mut Vec<String>) {
    for n in nodes {
        match &n.children {
            Some(children) => flatten(children, out),
            None if !n.is_dir => out.push(n.path.clone()),
            None => {}
        }
    }
}

fn tail_chars(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_owned();
    }
    let tail: String = s.chars().skip(count - max).collect();
    format!("…(truncated)\n{tail}")
}

/// Node's `path.matchesGlob` semantics (what the cloud tools use): `*` stays within a segment,
/// `**` crosses folders, `{a,b}` alternates.
fn compile_glob(pattern: &str) -> Result<globset::GlobMatcher, String> {
    GlobBuilder::new(pattern)
        .literal_separator(true)
        .build()
        .map(|g| g.compile_matcher())
        .map_err(|_| format!("\"{pattern}\" is not a valid glob pattern."))
}

/// One long LaTeX paragraph is routinely a single 5,000-character line, so an unclipped match
/// line can cost more context than the file it came from.
fn clip_around(text: &str, column: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= MAX_MATCH_LINE_CHARS {
        return text.to_owned();
    }
    // `column` counts UTF-16 units; for the clip window a char index close to it is enough.
    let column = column.min(chars.len());
    let pad = MAX_MATCH_LINE_CHARS / 4;
    let start = column.saturating_sub(pad);
    let end = (start + MAX_MATCH_LINE_CHARS).min(chars.len());
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        chars[start..end].iter().collect::<String>(),
        if end < chars.len() { "…" } else { "" }
    )
}

// ---- exact-once edits (port of apps/editor/lib/edit-text.ts) ---------------------------------

#[derive(Debug, PartialEq)]
pub enum EditError {
    Empty,
    NotFound,
    Ambiguous,
}

impl EditError {
    fn message(&self, path: &str) -> String {
        match self {
            Self::Empty => {
                "oldText cannot be empty. Pass the exact text you want to replace.".into()
            }
            Self::NotFound => format!(
                "oldText was not found in {path}. Read the file again: it may have changed, or your copy may still include the \"  42→\" line-number prefixes."
            ),
            Self::Ambiguous => format!(
                "oldText appears more than once in {path}. Include more surrounding lines so it matches exactly one place."
            ),
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct Edited {
    pub text: String,
    /// 1-based line of the replacement.
    pub line: usize,
}

/// Replaces the single occurrence of `old` with `new`. A file with Windows line endings is
/// matched on its LF form (models always write LF) and written back as CRLF.
pub fn apply_exact_edit(source: &str, old: &str, new: &str) -> Result<Edited, EditError> {
    if old.is_empty() {
        return Err(EditError::Empty);
    }
    let crlf =
        source.contains("\r\n") && source.matches('\n').count() == source.matches("\r\n").count();
    let (source, old, new) = if crlf {
        (
            source.replace("\r\n", "\n"),
            old.replace("\r\n", "\n"),
            new.replace("\r\n", "\n"),
        )
    } else {
        (source.to_owned(), old.to_owned(), new.to_owned())
    };
    let index = source.find(&old).ok_or(EditError::NotFound)?;
    if source[index + old.len()..].contains(&old) {
        return Err(EditError::Ambiguous);
    }
    let line = source[..index].matches('\n').count() + 1;
    let mut text = format!(
        "{}{}{}",
        &source[..index],
        new,
        &source[index + old.len()..]
    );
    if crlf {
        text = text.replace('\n', "\r\n");
    }
    Ok(Edited { text, line })
}

// ---- compile output (port of apps/editor/lib/compile-errors.ts) -------------------------------

#[derive(Debug, PartialEq)]
pub struct CompileError {
    pub file: String,
    pub line: u64,
    pub message: String,
}

static ANSI: LazyLock<Regex> = LazyLock::new(|| Regex::new("\u{1b}\\[[0-9;]*m").unwrap());
static ERROR_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^error: (.+?):(\d+): (.+)$").unwrap());

/// Tectonic prints `error: <file>:<line>: <message>`. Tectonic compiles twice on a cold cache
/// (cached-only, then with the network), so one mistake can appear twice: report it once.
pub fn parse_compile_errors(log: &str, compile_path: &str) -> Vec<CompileError> {
    let clean = ANSI.replace_all(log, "");
    let root = compile_path.rsplit('/').next().unwrap_or(compile_path);
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for raw in clean.split('\n') {
        let Some(c) = ERROR_LINE.captures(raw.trim()) else {
            continue;
        };
        let error = CompileError {
            file: if &c[1] == root {
                compile_path.to_owned()
            } else {
                c[1].to_owned()
            },
            line: c[2].parse().unwrap_or(0),
            message: c[3].trim().to_owned(),
        };
        if seen.insert((error.file.clone(), error.line, error.message.clone())) {
            out.push(error);
        }
    }
    out
}

pub fn format_compile_for_model(errors: &[CompileError], log: &str) -> String {
    let mut parts = Vec::new();
    if !errors.is_empty() {
        parts.push(format!(
            "Errors ({}):\n{}",
            errors.len(),
            errors
                .iter()
                .map(|e| format!("- {}:{}: {}", e.file, e.line, e.message))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }
    let clean = ANSI.replace_all(log, "");
    let clean = clean.trim_end();
    if !clean.is_empty() {
        let shown = if clean.chars().count() > MAX_MODEL_LOG_CHARS {
            tail_chars(clean, MAX_MODEL_LOG_CHARS)
        } else {
            clean.to_owned()
        };
        parts.push(format!("Log:\n{shown}"));
    }
    parts.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(files: &[(&str, &str)]) -> (tempfile::TempDir, ToolEnv) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let project = Project::open(root).unwrap();
        for (path, content) in files {
            project.write(path, content.as_bytes()).unwrap();
        }
        let tex = Arc::new(TexTools::new("never-run".into(), "never-run".into()));
        (dir, ToolEnv::new(project, tex))
    }

    fn call(name: &str, args: Value) -> ToolCall {
        ToolCall {
            id: "c".into(),
            name: name.into(),
            args,
            args_error: None,
        }
    }

    async fn run(env: &ToolEnv, name: &str, args: Value) -> Outcome {
        env.execute(&call(name, args)).await
    }

    #[test]
    fn every_tool_has_a_valid_schema_and_a_dispatch_arm() {
        let specs = specs();
        let names: Vec<_> = specs.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "list_files",
                "read_file",
                "grep",
                "edit_file",
                "write_file",
                "delete_file",
                "move_file",
                "compile_project",
                "todo_write"
            ]
        );
        for s in &specs {
            assert_eq!(s.schema["type"], "object", "{}", s.name);
            assert!(!s.description.is_empty());
            // Providers require names matching ^[a-zA-Z0-9_-]{1,64}$
            assert!(
                s.name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
            );
        }
    }

    // ---- edits ----

    #[test]
    fn exact_edit_requires_exactly_one_match() {
        assert_eq!(apply_exact_edit("a b a", "", "x"), Err(EditError::Empty));
        assert_eq!(
            apply_exact_edit("a b a", "z", "x"),
            Err(EditError::NotFound)
        );
        assert_eq!(
            apply_exact_edit("a b a", "a", "x"),
            Err(EditError::Ambiguous)
        );
        let e = apply_exact_edit("one\ntwo\nthree", "two", "2").unwrap();
        assert_eq!(
            e,
            Edited {
                text: "one\n2\nthree".into(),
                line: 2
            }
        );
        // Deleting by replacing with nothing.
        assert_eq!(
            apply_exact_edit("keep drop keep2", " drop", "")
                .unwrap()
                .text,
            "keep keep2"
        );
    }

    #[test]
    fn exact_edit_matches_through_windows_line_endings_and_writes_them_back() {
        let source = "\\section{A}\r\ntext\r\n\\section{B}\r\n";
        let e = apply_exact_edit(source, "\\section{A}\ntext", "\\section{A}\nnew text").unwrap();
        assert_eq!(e.text, "\\section{A}\r\nnew text\r\n\\section{B}\r\n");
        // Mixed endings are left alone: no silent normalisation of the user's file.
        let mixed = "a\r\nb\nc\n";
        assert_eq!(
            apply_exact_edit(mixed, "b\nc", "x").unwrap().text,
            "a\r\nx\n"
        );
        assert_eq!(
            apply_exact_edit(mixed, "a\nb", "x"),
            Err(EditError::NotFound)
        );
    }

    #[test]
    fn exact_edit_handles_multibyte_text() {
        let e = apply_exact_edit("สวัสดี\nชาวโลก", "ชาวโลก", "world").unwrap();
        assert_eq!(
            e,
            Edited {
                text: "สวัสดี\nworld".into(),
                line: 2
            }
        );
    }

    #[tokio::test]
    async fn edit_file_changes_one_block_and_reports_a_diffable_result() {
        let (_d, env) = env(&[("main.tex", "\\begin{document}\nHello\n\\end{document}\n")]);
        let o = run(
            &env,
            "edit_file",
            json!({ "path": "main.tex", "oldText": "Hello", "newText": "Hi there" }),
        )
        .await;
        assert!(o.ok, "{}", o.model);
        assert_eq!(o.model, "Edited main.tex — replaced 1 block at line 2.");
        assert_eq!(
            o.ui["before"],
            "\\begin{document}\nHello\n\\end{document}\n"
        );
        assert_eq!(
            o.ui["after"],
            "\\begin{document}\nHi there\n\\end{document}\n"
        );
        assert_eq!(
            env.project.read_text("main.tex").unwrap(),
            "\\begin{document}\nHi there\n\\end{document}\n"
        );

        let missing = run(
            &env,
            "edit_file",
            json!({ "path": "main.tex", "oldText": "nope", "newText": "x" }),
        )
        .await;
        assert!(!missing.ok);
        assert!(
            missing.model.contains("was not found in main.tex"),
            "{}",
            missing.model
        );
        let gone = run(
            &env,
            "edit_file",
            json!({ "path": "ghost.tex", "oldText": "a", "newText": "b" }),
        )
        .await;
        assert_eq!(gone.model, "Error: ghost.tex does not exist.");
    }

    // ---- read / list / grep ----

    #[tokio::test]
    async fn read_file_numbers_lines_and_supports_ranges() {
        let (_d, env) = env(&[("a.tex", "l1\nl2\nl3\nl4\nl5")]);
        let whole = run(&env, "read_file", json!({ "path": "a.tex" })).await;
        assert_eq!(
            whole.model,
            "     1→l1\n     2→l2\n     3→l3\n     4→l4\n     5→l5"
        );
        let part = run(
            &env,
            "read_file",
            json!({ "path": "a.tex", "offset": 2, "limit": 2 }),
        )
        .await;
        assert_eq!(
            part.model,
            "a.tex (lines 2-3 of 5)\n     2→l2\n     3→l3\n\n[truncated — 2 more lines. Call read_file again with offset=4.]"
        );
        assert_eq!(part.ui["firstLine"], 2);
        assert_eq!(part.ui["truncated"], true);
        // Numbers sent as strings still work.
        let strs = run(
            &env,
            "read_file",
            json!({ "path": "a.tex", "offset": "5", "limit": "1" }),
        )
        .await;
        assert!(strs.model.contains("     5→l5"), "{}", strs.model);
    }

    #[tokio::test]
    async fn read_file_truncates_on_a_line_boundary_by_character_budget() {
        let long = "x".repeat(30_000);
        let (_d, env) = env(&[("big.tex", &format!("{long}\n{long}\n{long}"))]);
        let o = run(&env, "read_file", json!({ "path": "big.tex" })).await;
        assert!(o.ok);
        assert_eq!(o.ui["truncated"], true);
        assert_eq!(o.ui["lastLine"], 1);
        assert!(
            o.model.contains("Call read_file again with offset=2"),
            "{}",
            &o.model[o.model.len() - 120..]
        );
    }

    #[tokio::test]
    async fn read_file_refuses_binary_folders_and_app_folders() {
        let (_d, env) = env(&[("img.bin", "ab")]);
        env.project.write("blob.dat", &[0u8, 1, 2, 0]).unwrap();
        env.project.create_dir("chapters").unwrap();
        env.project.write(".somescript/tasks.json", b"[]").unwrap();
        assert!(
            run(&env, "read_file", json!({ "path": "blob.dat" }))
                .await
                .model
                .contains("binary")
        );
        assert!(
            run(&env, "read_file", json!({ "path": "chapters" }))
                .await
                .model
                .contains("folder")
        );
        let hidden = run(
            &env,
            "read_file",
            json!({ "path": ".somescript/tasks.json" }),
        )
        .await;
        assert_eq!(
            hidden.model,
            "Error: .somescript/tasks.json is not available to the assistant."
        );
        let escape = run(&env, "read_file", json!({ "path": "../secret.txt" })).await;
        assert!(!escape.ok);
        assert!(
            escape.model.contains("outside the project"),
            "{}",
            escape.model
        );
        let abs = run(&env, "read_file", json!({ "path": "/etc/passwd" })).await;
        assert!(!abs.ok);
    }

    #[tokio::test]
    async fn list_files_filters_with_node_style_globs() {
        let (_d, env) = env(&[
            ("main.tex", ""),
            ("chapters/intro.tex", ""),
            ("chapters/deep/more.tex", ""),
            ("refs.bib", ""),
        ]);
        let all = run(&env, "list_files", json!({})).await;
        assert_eq!(all.ui["total"], 4);
        assert!(all.model.starts_with("Files in the project workspace:"));

        let top = run(&env, "list_files", json!({ "pattern": "*.tex" })).await;
        assert_eq!(top.ui["files"], json!(["main.tex"]));
        let deep = run(&env, "list_files", json!({ "pattern": "**/*.tex" })).await;
        assert_eq!(deep.ui["total"], 3);
        let alt = run(&env, "list_files", json!({ "pattern": "**/*.{bib,tex}" })).await;
        assert_eq!(alt.ui["total"], 4);
        let none = run(&env, "list_files", json!({ "pattern": "*.png" })).await;
        assert!(none.model.contains("try \"**/*.png\""), "{}", none.model);
        let bad = run(&env, "list_files", json!({ "pattern": "[" })).await;
        assert!(!bad.ok);
    }

    #[tokio::test]
    async fn grep_finds_literals_regexes_and_respects_the_path_glob() {
        let (_d, env) = env(&[
            ("main.tex", "\\cite{knuth}\nsee \\label{sec:a}\n"),
            ("chapters/a.tex", "\\cite{lamport} and \\cite{knuth}\n"),
        ]);
        let o = run(&env, "grep", json!({ "query": "\\cite{knuth}" })).await;
        assert!(o.ok);
        assert_eq!(o.ui["matches"].as_array().unwrap().len(), 2);
        assert!(
            o.model.starts_with("2 matches in 2 files for"),
            "{}",
            o.model
        );
        assert!(
            o.model.contains("main.tex:1:1  \\cite{knuth}"),
            "{}",
            o.model
        );
        assert!(o.model.contains("chapters/a.tex:1:20"), "{}", o.model);

        let scoped = run(
            &env,
            "grep",
            json!({ "query": "cite", "path": "chapters/*.tex" }),
        )
        .await;
        assert_eq!(scoped.ui["matches"].as_array().unwrap().len(), 2);
        assert!(scoped.model.starts_with("2 matches in 1 file"));

        let re = run(
            &env,
            "grep",
            json!({ "query": "label\\{[a-z:]+\\}", "useRegex": true }),
        )
        .await;
        assert_eq!(re.ui["matches"].as_array().unwrap().len(), 1);
        let case = run(&env, "grep", json!({ "query": "SEE", "matchCase": true })).await;
        assert_eq!(case.model, "No matches for \"SEE\".");
        let bad = run(&env, "grep", json!({ "query": "(", "useRegex": true })).await;
        assert_eq!(bad.model, "Error: Invalid regular expression");
    }

    #[test]
    fn long_match_lines_are_clipped_around_the_match() {
        let line = format!("{}NEEDLE{}", "a".repeat(3000), "b".repeat(3000));
        let clipped = clip_around(&line, 3000);
        assert!(clipped.contains("NEEDLE"), "{clipped}");
        assert!(clipped.chars().count() < 260);
        assert!(clipped.starts_with('…') && clipped.ends_with('…'));
        assert_eq!(clip_around("short", 2), "short");
    }

    // ---- write / delete / move ----

    #[tokio::test]
    async fn write_file_creates_overwrites_and_reports_the_previous_text() {
        let (_d, env) = env(&[]);
        let made = run(
            &env,
            "write_file",
            json!({ "path": "new/dir/a.tex", "content": "v1" }),
        )
        .await;
        assert!(made.ok);
        assert_eq!(made.ui["created"], true);
        assert!(made.ui["before"].is_null());
        assert_eq!(made.model, "Successfully updated file: new/dir/a.tex");

        let over = run(
            &env,
            "write_file",
            json!({ "path": "new/dir/a.tex", "content": "v2" }),
        )
        .await;
        assert_eq!(over.ui["created"], false);
        assert_eq!(over.ui["before"], "v1");
        assert_eq!(env.project.read_text("new/dir/a.tex").unwrap(), "v2");
    }

    #[tokio::test]
    async fn write_file_refuses_to_clobber_what_the_user_changed_since_the_read() {
        let (_d, env) = env(&[("main.tex", "original")]);
        run(&env, "read_file", json!({ "path": "main.tex" })).await;
        // The user types in the editor; autosave writes the file.
        env.project
            .write("main.tex", b"original plus the user's edit")
            .unwrap();
        let o = run(
            &env,
            "write_file",
            json!({ "path": "main.tex", "content": "model rewrite" }),
        )
        .await;
        assert!(!o.ok);
        assert_eq!(o.ui["stale"], true);
        assert!(o.model.contains("changed since you read it"), "{}", o.model);
        assert_eq!(
            env.project.read_text("main.tex").unwrap(),
            "original plus the user's edit"
        );

        // After reading again, the write goes through.
        run(&env, "read_file", json!({ "path": "main.tex" })).await;
        assert!(
            run(
                &env,
                "write_file",
                json!({ "path": "main.tex", "content": "ok" })
            )
            .await
            .ok
        );
        // And two writes in a row don't trip over the model's own earlier write.
        assert!(
            run(
                &env,
                "write_file",
                json!({ "path": "main.tex", "content": "ok again" })
            )
            .await
            .ok
        );
    }

    #[tokio::test]
    async fn write_file_validates_path_size_and_target_kind() {
        let (_d, env) = env(&[]);
        env.project.create_dir("folder").unwrap();
        env.project.write("pic.bin", &[0u8, 0, 1]).unwrap();
        assert!(
            !run(
                &env,
                "write_file",
                json!({ "path": "folder", "content": "x" })
            )
            .await
            .ok
        );
        assert!(
            !run(
                &env,
                "write_file",
                json!({ "path": "pic.bin", "content": "x" })
            )
            .await
            .ok
        );
        assert!(
            !run(
                &env,
                "write_file",
                json!({ "path": "../out.tex", "content": "x" })
            )
            .await
            .ok
        );
        assert!(
            !run(
                &env,
                "write_file",
                json!({ "path": ".git/config", "content": "x" })
            )
            .await
            .ok
        );
        assert!(!run(&env, "write_file", json!({ "path": "a.tex" })).await.ok);
        let huge = "x".repeat(MAX_WRITE_BYTES + 1);
        let o = run(
            &env,
            "write_file",
            json!({ "path": "huge.tex", "content": huge }),
        )
        .await;
        assert!(!o.ok);
        assert!(!env.project.root().join("huge.tex").exists());
    }

    #[tokio::test]
    async fn delete_and_move_work_on_files_and_refuse_the_rest() {
        let (_d, env) = env(&[("old.tex", "keep me"), ("other.tex", "x")]);
        env.project.create_dir("dir").unwrap();
        let moved = run(
            &env,
            "move_file",
            json!({ "from": "old.tex", "to": "sub/new.tex" }),
        )
        .await;
        assert!(moved.ok, "{}", moved.model);
        assert_eq!(env.project.read_text("sub/new.tex").unwrap(), "keep me");
        assert!(
            !run(
                &env,
                "move_file",
                json!({ "from": "gone.tex", "to": "x.tex" })
            )
            .await
            .ok
        );
        let clash = run(
            &env,
            "move_file",
            json!({ "from": "other.tex", "to": "sub/new.tex" }),
        )
        .await;
        assert!(clash.model.contains("already exists"), "{}", clash.model);
        assert_eq!(env.project.read_text("sub/new.tex").unwrap(), "keep me");

        let del = run(&env, "delete_file", json!({ "path": "sub/new.tex" })).await;
        assert!(del.ok);
        assert_eq!(del.ui["before"], "keep me");
        assert!(!env.project.root().join("sub/new.tex").exists());
        assert!(
            run(&env, "delete_file", json!({ "path": "dir" }))
                .await
                .model
                .contains("folder")
        );
        assert!(
            !run(&env, "delete_file", json!({ "path": "missing.tex" }))
                .await
                .ok
        );
        assert!(
            !run(&env, "delete_file", json!({ "path": ".somescript" }))
                .await
                .ok
        );
    }

    #[tokio::test]
    async fn bad_arguments_and_unknown_tools_come_back_as_errors_the_model_can_act_on() {
        let (_d, env) = env(&[]);
        // The error says what to send and what arrived, so the model can fix the call.
        let empty = run(&env, "read_file", json!({})).await.model;
        assert!(empty.starts_with("Error: path is required."), "{empty}");
        assert!(empty.contains(r#"{"path": "main.tex"}"#), "{empty}");
        assert!(empty.contains("arrived empty"), "{empty}");
        let wrong = run(&env, "read_file", json!({ "folder": "x", "n": 1 }))
            .await
            .model;
        assert!(wrong.contains(r#""folder", "n""#), "{wrong}");
        assert!(
            run(&env, "teleport", json!({}))
                .await
                .model
                .contains("no tool called \"teleport\"")
        );
        let mut c = call("read_file", json!({}));
        c.args_error = Some("The tool arguments were not valid JSON (x).".into());
        assert!(env.execute(&c).await.model.contains("not valid JSON"));
    }

    // Open-weight models often use another tool's argument names. They are accepted, so the call
    // works the first time instead of looping on "path is required".
    #[tokio::test]
    async fn the_common_alternative_argument_names_are_accepted() {
        let (d, env) = env(&[("main.tex", "hello world\n"), ("old.tex", "x\n")]);
        for key in ["file_path", "filePath", "filename", "file", "target_file"] {
            let o = run(&env, "read_file", json!({ key: "main.tex" })).await;
            assert!(o.ok, "{key}: {}", o.model);
            assert!(o.model.contains("hello world"), "{key}: {}", o.model);
        }

        let o = run(
            &env,
            "edit_file",
            json!({ "file_path": "main.tex", "old_string": "hello", "new_string": "goodbye" }),
        )
        .await;
        assert!(o.ok, "{}", o.model);
        assert_eq!(
            std::fs::read_to_string(d.path().join("proj").join("main.tex")).unwrap(),
            "goodbye world\n"
        );

        let o = run(
            &env,
            "write_file",
            json!({ "filepath": "new.tex", "contents": "fresh\n" }),
        )
        .await;
        assert!(o.ok, "{}", o.model);
        assert_eq!(
            std::fs::read_to_string(d.path().join("proj").join("new.tex")).unwrap(),
            "fresh\n"
        );

        let o = run(
            &env,
            "move_file",
            json!({ "source": "new.tex", "destination": "moved.tex" }),
        )
        .await;
        assert!(o.ok, "{}", o.model);
        let o = run(&env, "delete_file", json!({ "file_path": "old.tex" })).await;
        assert!(o.ok, "{}", o.model);
        assert!(!d.path().join("proj").join("old.tex").exists());
    }

    #[tokio::test]
    async fn todo_write_normalises_the_list() {
        let (_d, env) = env(&[]);
        let o = run(
            &env,
            "todo_write",
            json!({ "todos": [
                { "content": " Read the intro ", "status": "completed" },
                { "content": "Fix refs", "status": "doing" },
                { "content": "  ", "status": "pending" },
                "junk",
            ]}),
        )
        .await;
        assert!(o.ok);
        assert_eq!(
            o.ui["todos"],
            json!([
                { "content": "Read the intro", "status": "completed" },
                { "content": "Fix refs", "status": "pending" },
            ])
        );
        assert!(!run(&env, "todo_write", json!({ "todos": "nope" })).await.ok);
    }

    // ---- compile ----

    #[test]
    fn compile_errors_are_parsed_and_deduplicated_like_the_editor_does() {
        let log = "note: x\nerror: main.tex:12: Undefined control sequence\n\u{1b}[31merror: chapters/a.tex:3: Missing $ inserted\u{1b}[0m\nerror: main.tex:12: Undefined control sequence\nerror: no file here\n";
        assert_eq!(
            parse_compile_errors(log, "main.tex"),
            vec![
                CompileError {
                    file: "main.tex".into(),
                    line: 12,
                    message: "Undefined control sequence".into()
                },
                CompileError {
                    file: "chapters/a.tex".into(),
                    line: 3,
                    message: "Missing $ inserted".into()
                },
            ]
        );
        // A bare basename maps to the full compile path.
        let nested = parse_compile_errors("error: intro.tex:1: Oops\n", "chapters/intro.tex");
        assert_eq!(nested[0].file, "chapters/intro.tex");
        let text = format_compile_for_model(&nested, &"x".repeat(5000));
        assert!(text.starts_with("Errors (1):\n- chapters/intro.tex:1: Oops"));
        assert!(text.contains("…(truncated)"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn compile_project_runs_the_engine_and_reports_the_pdf_or_the_errors() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let script = |name: &str, body: &str| {
            let path = dir.path().join(name);
            std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            path
        };
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let project = Project::open(root).unwrap();
        project
            .write("main.tex", b"\\documentclass{article}")
            .unwrap();
        project
            .write(
                ".somescript/project-settings.json",
                br#"{"mainFilePath":"main.tex"}"#,
            )
            .unwrap();

        let ok = script(
            "ok",
            r#"for a in "$@"; do [ "$p" = "--outdir" ] && out="$a"; p="$a"; tex="$a"; done
stem=$(basename "$tex" .tex); mkdir -p "$out"; echo "%PDF" > "$out/$stem.pdf"; echo "Writing $stem.pdf""#,
        );
        let env_ok = ToolEnv::new(project.clone(), Arc::new(TexTools::new(ok, "x".into())));
        let good = run(&env_ok, "compile_project", json!({})).await;
        assert!(good.ok, "{}", good.model);
        assert_eq!(good.model, "Compiled main.tex successfully.");
        assert_eq!(good.ui["pdfPath"], ".preview-cache/main.pdf");

        let failing = script(
            "bad",
            "echo 'error: main.tex:3: Undefined control sequence' >&2; exit 2",
        );
        let env_bad = ToolEnv::new(project, Arc::new(TexTools::new(failing, "x".into())));
        let bad = run(&env_bad, "compile_project", json!({ "path": "main.tex" })).await;
        assert!(!bad.ok);
        assert!(bad.ui["pdfPath"].is_null());
        assert_eq!(bad.ui["errors"][0]["line"], 3);
        assert!(
            bad.model.starts_with("Compile FAILED for main.tex."),
            "{}",
            bad.model
        );
        assert!(
            bad.model
                .contains("- main.tex:3: Undefined control sequence")
        );

        let missing = run(&env_bad, "compile_project", json!({ "path": "nope.tex" })).await;
        assert_eq!(missing.model, "Error: nope.tex does not exist.");
        let notex = run(&env_bad, "compile_project", json!({ "path": "main.txt" })).await;
        assert!(notex.model.contains("Only .tex files"), "{}", notex.model);
    }
}
