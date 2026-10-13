//! Port of apps/editor/app/api/search/route.ts with lib/search-files.ts and
//! lib/search-pattern.ts. Uses the `regex` crate, which is linear-time (no ReDoS screen
//! needed) but has no lookaround or backreferences: those report "Invalid regular expression".
//!
//! Offsets: the UI highlights with JS string indexes, so `matchIndex` is a UTF-16 offset,
//! not a byte offset. That matters for Thai and any other non-ASCII line.

use super::ApiState;
use crate::{
    error::{ApiError, ApiResult, blocking},
    storage::{FileNode, Project},
};
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use regex::{NoExpand, Regex, RegexBuilder};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

const MAX_QUERY_LENGTH: usize = 512;
const MAX_RESULTS: usize = 2000;
const STALE: &str = "Search result is stale; refresh the search";

const BINARY_EXTENSIONS: &[&str] = &[
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".gz", ".tar", ".woff", ".woff2",
    ".ttf", ".eot", ".mp4", ".mp3",
];

/// Extension deny-list (lib/search-files.ts): cheaper than sniffing, never reads the file.
pub fn is_text_file(name: &str) -> bool {
    let base = name.rsplit('/').next().unwrap_or(name);
    let ext = match base.rfind('.') {
        Some(i) if i > 0 => base[i..].to_lowercase(),
        _ => String::new(),
    };
    !BINARY_EXTENSIONS.contains(&ext.as_str())
}

pub fn build_pattern(
    query: &str,
    match_case: bool,
    whole_word: bool,
    use_regex: bool,
) -> ApiResult<Regex> {
    if query.chars().count() > MAX_QUERY_LENGTH {
        return Err(ApiError::bad_request(format!(
            "Query too long (max {MAX_QUERY_LENGTH} characters)"
        )));
    }
    let source = if use_regex {
        query.to_owned()
    } else if whole_word {
        // JS `\b` is ASCII-only; Rust's is Unicode-aware, so pin it to match the cloud editor.
        format!(r"(?-u:\b){}(?-u:\b)", regex::escape(query))
    } else {
        regex::escape(query)
    };
    RegexBuilder::new(&source)
        .case_insensitive(!match_case)
        .build()
        .map_err(|_| ApiError::bad_request("Invalid regular expression"))
}

/// Byte offset in `line` -> JS (UTF-16 code unit) offset.
fn utf16_offset(line: &str, byte: usize) -> usize {
    line[..byte].encode_utf16().count()
}

/// Replaces exactly the match at JS offset `match_index`; `None` if the line changed or no
/// match starts there (the UI then asks the user to refresh).
pub fn replace_match_at(
    line: &str,
    re: &Regex,
    match_index: usize,
    replacement: &str,
    expected_line: Option<&str>,
) -> Option<String> {
    if expected_line.is_some_and(|expected| expected != line) {
        return None;
    }
    let m = re
        .find_iter(line)
        .find(|m| utf16_offset(line, m.start()) == match_index)?;
    Some(format!(
        "{}{}{}",
        &line[..m.start()],
        replacement,
        &line[m.end()..]
    ))
}

pub struct LineMatch {
    pub path: String,
    pub name: String,
    pub line: usize,
    pub column: usize,
    pub text: String,
}

fn text_files(nodes: &[FileNode], out: &mut Vec<(String, String)>) {
    for node in nodes {
        match &node.children {
            Some(children) => text_files(children, out),
            None if is_text_file(&node.name) => out.push((node.path.clone(), node.name.clone())),
            None => {}
        }
    }
}

/// Searches in tree order. `only_path` limits to one file; lines are 1-based and inclusive.
pub fn search_files(
    project: &Project,
    re: &Regex,
    only_path: Option<&str>,
    start: Option<usize>,
    end: Option<usize>,
    max: usize,
) -> ApiResult<Vec<LineMatch>> {
    let mut files = Vec::new();
    text_files(&project.list_tree()?, &mut files);
    let mut out = Vec::new();
    for (path, name) in files {
        if only_path.is_some_and(|p| p != path) {
            continue;
        }
        // An unreadable file is skipped rather than failing the whole search.
        let Ok(content) = project.read_text(&path) else {
            continue;
        };
        for (idx, line) in content.split('\n').enumerate() {
            let number = idx + 1;
            if start.is_some_and(|s| number < s) || end.is_some_and(|e| number > e) {
                continue;
            }
            for m in re.find_iter(line) {
                if out.len() >= max {
                    return Ok(out);
                }
                out.push(LineMatch {
                    path: path.clone(),
                    name: name.clone(),
                    line: number,
                    column: utf16_offset(line, m.start()),
                    text: line.to_owned(),
                });
            }
        }
    }
    Ok(out)
}

fn flag(q: &HashMap<String, String>, key: &str) -> bool {
    q.get(key).is_some_and(|v| v == "true")
}

pub async fn get(
    State(s): State<ApiState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let project = s.library.project(q.get("projectId").map(String::as_str))?;
    let query = q.get("query").cloned().unwrap_or_default();
    if query.is_empty() {
        return Ok(Json(json!({ "results": [], "resultsByFile": {} })));
    }
    let re = build_pattern(
        &query,
        flag(&q, "matchCase"),
        flag(&q, "matchWholeWord"),
        flag(&q, "useRegex"),
    )?;
    let scoped = q.get("scope").is_some_and(|v| v == "current");
    let selected = q.get("selectedPath").cloned().unwrap_or_default();
    let line_of = |key: &str| q.get(key).and_then(|v| v.parse::<usize>().ok());
    let (start, end) = if scoped {
        (line_of("startLine"), line_of("endLine"))
    } else {
        (None, None)
    };

    let matches = blocking(move || {
        let only = (scoped && !selected.is_empty()).then_some(selected.as_str());
        search_files(&project, &re, only, start, end, MAX_RESULTS)
    })
    .await?;

    let mut results = Vec::with_capacity(matches.len());
    let mut by_file: Map<String, Value> = Map::new();
    for m in matches {
        let result = json!({
            "fileId": m.path, "fileName": m.name, "line": m.line, "text": m.text, "matchIndex": m.column,
        });
        by_file
            .entry(m.path.clone())
            .or_insert_with(|| json!({ "name": m.name, "matches": [] }))["matches"]
            .as_array_mut()
            .expect("matches is an array")
            .push(result.clone());
        results.push(result);
    }
    Ok(Json(
        json!({ "results": results, "resultsByFile": by_file }),
    ))
}

struct Target {
    file_id: String,
    line: usize,
    match_index: usize,
    line_text: String,
}

fn whole_number(v: Option<&Value>, min: u64) -> Option<usize> {
    let n = v?.as_u64().or_else(|| {
        v?.as_f64()
            .filter(|f| f.fract() == 0.0 && *f >= 0.0)
            .map(|f| f as u64)
    })?;
    (n >= min).then_some(n as usize)
}

fn parse_target(v: &Value) -> Option<Target> {
    let file_id = v
        .get("fileId")?
        .as_str()
        .filter(|f| !f.is_empty() && is_text_file(f))?;
    let line_text = v
        .get("lineText")?
        .as_str()
        .filter(|t| t.len() <= 1_000_000)?;
    Some(Target {
        file_id: file_id.to_owned(),
        line: whole_number(v.get("line"), 1)?,
        match_index: whole_number(v.get("matchIndex"), 0)?,
        line_text: line_text.to_owned(),
    })
}

/// `Ok(None)` for absent/empty, `Err` for present-but-invalid (the route's parseLineBoundary).
fn line_boundary(v: Option<&Value>) -> Result<Option<usize>, ()> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if s.is_empty() => Ok(None),
        Some(Value::String(s)) => s
            .parse::<usize>()
            .ok()
            .filter(|n| *n >= 1)
            .map(Some)
            .ok_or(()),
        Some(other) => whole_number(Some(other), 1).map(Some).ok_or(()),
    }
}

fn tree_has_file(nodes: &[FileNode], path: &str) -> bool {
    nodes.iter().any(|n| match &n.children {
        Some(children) => tree_has_file(children, path),
        None => n.path == path,
    })
}

pub async fn post(State(s): State<ApiState>, Json(body): Json<Value>) -> ApiResult<Response> {
    let project = s
        .library
        .project(body.get("projectId").and_then(Value::as_str))?;
    let text = |key: &str| {
        body.get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    };
    let on = |key: &str| body.get(key).and_then(Value::as_bool) == Some(true);
    let (query, replace_text, selected) =
        (text("query"), text("replaceText"), text("selectedPath"));
    let scope = body
        .get("scope")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("all");

    if scope != "all" && scope != "current" {
        return Err(ApiError::bad_request("Invalid search scope"));
    }
    let (Ok(start), Ok(end)) = (
        line_boundary(body.get("startLine")),
        line_boundary(body.get("endLine")),
    ) else {
        return Err(ApiError::bad_request("Invalid line range"));
    };
    if query.is_empty() {
        return Err(ApiError::bad_request("Missing query"));
    }
    let re = build_pattern(
        &query,
        on("matchCase"),
        on("matchWholeWord"),
        on("useRegex"),
    )?;
    let scoped = scope == "current";

    // Single-match replace: `target` pins one occurrence by file/line/offset (as GET returned it).
    if let Some(raw) = body.get("target").filter(|t| !t.is_null()) {
        let target =
            parse_target(raw).ok_or_else(|| ApiError::bad_request("Invalid match target"))?;
        return blocking(move || {
            replace_one(
                &project,
                &re,
                &target,
                &replace_text,
                scoped,
                &selected,
                start,
                end,
            )
        })
        .await
        .map(|v| Json(v).into_response());
    }

    let outcome =
        blocking(move || replace_all(&project, &re, &replace_text, scoped, &selected, start, end))
            .await?;
    let status = if outcome["success"] == true {
        StatusCode::OK
    } else {
        StatusCode::CONFLICT
    };
    Ok((status, Json(outcome)).into_response())
}

#[allow(clippy::too_many_arguments)]
fn replace_one(
    project: &Project,
    re: &Regex,
    target: &Target,
    replacement: &str,
    scoped: bool,
    selected: &str,
    start: Option<usize>,
    end: Option<usize>,
) -> ApiResult<Value> {
    if !tree_has_file(&project.list_tree()?, &target.file_id) {
        return Err(ApiError::not_found("File not found"));
    }
    if (scoped && (selected.is_empty() || target.file_id != selected))
        || start.is_some_and(|s| target.line < s)
        || end.is_some_and(|e| target.line > e)
    {
        return Err(ApiError::conflict(STALE));
    }
    let (content, version) = project.read_text_versioned(&target.file_id)?;
    let mut lines: Vec<&str> = content.split('\n').collect();
    let line = *lines
        .get(target.line - 1)
        .ok_or_else(|| ApiError::conflict(STALE))?;
    let replaced = replace_match_at(
        line,
        re,
        target.match_index,
        replacement,
        Some(&target.line_text),
    )
    .ok_or_else(|| ApiError::conflict(STALE))?;
    lines[target.line - 1] = &replaced;
    if !project.write_if_version(&target.file_id, &version, &lines.join("\n"))? {
        return Err(ApiError::conflict(
            "File changed while replacing; refresh the search",
        ));
    }
    project.touch();
    Ok(json!({ "success": true, "count": 1, "modifiedFiles": [target.file_id] }))
}

/// Whole-content replace like the cloud editor, except a line range is honored. The Next
/// route ignores `startLine`/`endLine` here, so "replace in selection" rewrites the whole
/// file there; replacing outside what the user selected would be a surprising edit.
fn replace_in(
    content: &str,
    re: &Regex,
    replacement: &str,
    start: Option<usize>,
    end: Option<usize>,
) -> (String, usize) {
    if start.is_none() && end.is_none() {
        let count = re.find_iter(content).count();
        return (
            re.replace_all(content, NoExpand(replacement)).into_owned(),
            count,
        );
    }
    let mut count = 0;
    let lines: Vec<String> = content
        .split('\n')
        .enumerate()
        .map(|(idx, line)| {
            let n = idx + 1;
            if start.is_some_and(|s| n < s) || end.is_some_and(|e| n > e) {
                return line.to_owned();
            }
            count += re.find_iter(line).count();
            re.replace_all(line, NoExpand(replacement)).into_owned()
        })
        .collect();
    (lines.join("\n"), count)
}

fn replace_all(
    project: &Project,
    re: &Regex,
    replacement: &str,
    scoped: bool,
    selected: &str,
    start: Option<usize>,
    end: Option<usize>,
) -> ApiResult<Value> {
    let mut files = Vec::new();
    text_files(&project.list_tree()?, &mut files);
    let (mut count, mut modified, mut conflicts) = (0, Vec::new(), Vec::new());
    for (path, _) in files {
        if scoped && path != selected {
            continue;
        }
        let Ok((content, version)) = project.read_text_versioned(&path) else {
            continue;
        };
        let (replaced, n) = replace_in(&content, re, replacement, start, end);
        if n == 0 {
            continue;
        }
        match project.write_if_version(&path, &version, &replaced) {
            Ok(true) => {
                count += n;
                modified.push(path);
            }
            Ok(false) => conflicts.push(path),
            Err(_) => {}
        }
    }
    if !modified.is_empty() {
        project.touch();
    }
    if !conflicts.is_empty() {
        return Ok(json!({
            "success": false,
            "error": "Some files changed while replacing; refresh the search",
            "count": count, "modifiedFiles": modified, "conflicts": conflicts,
        }));
    }
    Ok(json!({ "success": true, "count": count, "modifiedFiles": modified }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn re(q: &str, case: bool, word: bool, rx: bool) -> Regex {
        build_pattern(q, case, word, rx).unwrap()
    }

    #[test]
    fn text_file_check_is_an_extension_deny_list() {
        assert!(is_text_file("main.tex"));
        assert!(is_text_file(".gitignore"));
        assert!(is_text_file("Makefile"));
        assert!(!is_text_file("fig.PNG"));
        assert!(!is_text_file("dir/font.woff2"));
    }

    #[test]
    fn plain_queries_are_literal_and_case_insensitive_by_default() {
        let r = re("a.b(", false, false, false);
        assert!(r.is_match("xA.B(y"));
        assert!(!r.is_match("a-b("));
        assert!(!re("abc", true, false, false).is_match("ABC"));
    }

    #[test]
    fn whole_word_uses_ascii_boundaries_like_js() {
        let r = re("cat", false, true, false);
        assert!(r.is_match("a cat sat"));
        assert!(!r.is_match("concatenate"));
        // JS \b treats non-ASCII letters as non-word characters, so this matches there too.
        assert!(r.is_match("éคcat"));
    }

    #[test]
    fn bad_patterns_are_400s_not_panics() {
        assert!(build_pattern("(", true, false, true).is_err());
        assert!(build_pattern("(?=x)", true, false, true).is_err()); // lookahead unsupported
        assert!(build_pattern(&"a".repeat(513), true, false, false).is_err());
        assert!(build_pattern("(", true, false, false).is_ok()); // literal, not a regex
    }

    #[test]
    fn match_index_is_utf16_so_thai_lines_highlight_correctly() {
        let line = "สวัสดี hello"; // 6 UTF-16 units of Thai, then a space
        let r = re("hello", false, false, false);
        let m = r.find(line).unwrap();
        assert_eq!(utf16_offset(line, m.start()), 7);
        assert_ne!(m.start(), 7); // the byte offset differs, which is the bug this prevents
        let out = replace_match_at(line, &r, 7, "world", Some(line)).unwrap();
        assert_eq!(out, "สวัสดี world");
        assert_eq!(replace_match_at(line, &r, 3, "x", None), None);
        assert_eq!(replace_match_at(line, &r, 7, "x", Some("changed")), None);
    }

    #[test]
    fn replace_match_at_touches_only_the_chosen_occurrence() {
        let r = re("ab", false, false, false);
        assert_eq!(
            replace_match_at("ab ab ab", &r, 3, "X", None).unwrap(),
            "ab X ab"
        );
    }

    #[test]
    fn replacement_text_is_literal() {
        let r = re("x", false, false, false);
        let (out, n) = replace_in("x and x", &r, "$1 \\n", None, None);
        assert_eq!((out.as_str(), n), ("$1 \\n and $1 \\n", 2));
    }

    #[test]
    fn replace_all_honors_a_line_range() {
        let r = re("a", true, false, false);
        let (out, n) = replace_in("a\na\na\na", &r, "B", Some(2), Some(3));
        assert_eq!((out.as_str(), n), ("a\nB\nB\na", 2));
        let (out, n) = replace_in("a\na", &r, "B", Some(2), None);
        assert_eq!((out.as_str(), n), ("a\nB", 1));
    }

    #[test]
    fn search_reports_tree_order_lines_and_respects_range_and_limit() {
        let dir = tempfile::tempdir().unwrap();
        let p = Project::open(dir.path().to_path_buf()).unwrap();
        p.write("b.tex", b"hit\nmiss\nhit hit").unwrap();
        p.write("sub/a.tex", b"hit").unwrap();
        p.write("fig.png", b"hit").unwrap(); // binary extension: never searched
        let r = re("hit", true, false, false);

        let all = search_files(&p, &r, None, None, None, 100).unwrap();
        let order: Vec<_> = all
            .iter()
            .map(|m| (m.path.as_str(), m.line, m.column))
            .collect();
        // Directories come first in the tree, then files.
        assert_eq!(
            order,
            [
                ("sub/a.tex", 1, 0),
                ("b.tex", 1, 0),
                ("b.tex", 3, 0),
                ("b.tex", 3, 4)
            ]
        );

        let ranged = search_files(&p, &r, Some("b.tex"), Some(2), Some(3), 100).unwrap();
        assert_eq!(ranged.len(), 2);
        assert_eq!(search_files(&p, &r, None, None, None, 2).unwrap().len(), 2);
    }

    #[test]
    fn line_boundary_accepts_blank_and_rejects_garbage() {
        assert_eq!(line_boundary(None), Ok(None));
        assert_eq!(line_boundary(Some(&json!(""))), Ok(None));
        assert_eq!(line_boundary(Some(&json!(3))), Ok(Some(3)));
        assert_eq!(line_boundary(Some(&json!("4"))), Ok(Some(4)));
        assert_eq!(line_boundary(Some(&json!(0))), Err(()));
        assert_eq!(line_boundary(Some(&json!("x"))), Err(()));
        assert_eq!(line_boundary(Some(&json!(1.5))), Err(()));
    }
}
