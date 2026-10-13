//! ZIP import/export. Port of apps/editor/app/api/project/{import,export}/route.ts and the
//! path helpers in lib/zip.ts, on the `zip` crate. Imported archives are untrusted: every
//! entry path is normalized and confined to the project, and decompressed sizes are capped
//! by counting bytes actually read, since an entry's declared size can lie.

use crate::{
    error::{ApiError, ApiResult},
    storage::{FileNode, Project},
};
use axum::http::StatusCode;
use std::io::{Cursor, Read, Write};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

// Same limits as apps/editor/lib/zip.ts.
pub const MAX_UPLOAD_BYTES: usize = 250 * 1024 * 1024;

pub struct Limits {
    pub entries: usize,
    pub file_bytes: u64,
    pub total_bytes: u64,
}

const LIMITS: Limits = Limits {
    entries: 2000,
    file_bytes: 100 * 1024 * 1024,
    total_bytes: 500 * 1024 * 1024,
};

fn too_large(msg: &str) -> ApiError {
    ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, msg)
}

/// Normalized safe relative path (a trailing `/` marks a folder entry), or `None` if the
/// entry must be rejected: backslashes, absolute paths, or anything escaping the root.
pub fn safe_zip_path(name: &str) -> Option<String> {
    if name.contains('\\') || name.starts_with('/') {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for seg in name.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        return None;
    }
    let mut out = parts.join("/");
    if name.ends_with('/') {
        out.push('/');
    }
    Some(out)
}

/// A single top-level wrapper folder shared by every entry (a zip exported as
/// "My Project/main.tex", ...). Returns its name so the caller can strip it, or "" when
/// the archive is already flat or has several top-level entries.
pub fn strip_common_zip_root(paths: &[String]) -> String {
    let Some(nested) = paths.iter().find(|p| p.contains('/')) else {
        return String::new();
    };
    let first = nested.split('/').next().unwrap_or_default();
    if first.is_empty() {
        return String::new();
    }
    if paths.iter().all(|p| p.split('/').next() == Some(first)) {
        first.to_owned()
    } else {
        String::new()
    }
}

/// macOS Finder litter that should never become project files.
fn is_junk(name: &str) -> bool {
    name.starts_with("__MACOSX") || name.contains(".DS_Store")
}

pub fn import_zip(project: &Project, bytes: &[u8]) -> ApiResult<()> {
    import_zip_limited(project, bytes, &LIMITS)
}

fn import_zip_limited(project: &Project, bytes: &[u8], limits: &Limits) -> ApiResult<()> {
    if bytes.len() > MAX_UPLOAD_BYTES {
        return Err(too_large("Upload too large"));
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| ApiError::bad_request("That doesn't look like a valid ZIP file"))?;
    if archive.len() > limits.entries {
        return Err(too_large("Archive has too many entries"));
    }

    let names: Vec<String> = (0..archive.len())
        .map(|i| {
            archive
                .by_index_raw(i)
                .and_then(|f| f.name().map(|n| n.into_owned()))
        })
        .collect::<Result<_, _>>()
        .map_err(|_| ApiError::bad_request("That ZIP file is damaged"))?;
    let root_prefix = strip_common_zip_root(
        &names
            .iter()
            .filter(|n| !is_junk(n))
            .filter_map(|n| safe_zip_path(n))
            .collect::<Vec<_>>(),
    );

    let mut total = 0u64;
    for (i, name) in names.iter().enumerate() {
        if is_junk(name) {
            continue;
        }
        let Some(mut path) = safe_zip_path(name) else {
            continue;
        };
        if !root_prefix.is_empty() {
            if path.trim_end_matches('/') == root_prefix {
                continue;
            }
            if let Some(rest) = path.strip_prefix(&format!("{root_prefix}/")) {
                path = rest.to_owned();
            }
            if path.is_empty() {
                continue; // the wrapper folder's own entry (trailing-slash form)
            }
        }

        let mut entry = archive
            .by_index(i)
            .map_err(|_| ApiError::bad_request("Could not read an entry in the ZIP file"))?;
        if entry.is_dir() || path.ends_with('/') {
            project.create_dir(path.trim_end_matches('/'))?;
            continue;
        }
        // Read at most one byte past the limit: enough to detect a lying size header.
        let mut content = Vec::new();
        (&mut entry)
            .take(limits.file_bytes + 1)
            .read_to_end(&mut content)
            .map_err(|_| {
                ApiError::bad_request("Could not decompress an entry (unsupported or damaged)")
            })?;
        if content.len() as u64 > limits.file_bytes {
            return Err(too_large("Archive entry too large"));
        }
        total += content.len() as u64;
        if total > limits.total_bytes {
            return Err(too_large("Archive too large when decompressed"));
        }
        project.write(&path, &content)?;
    }
    project.touch();
    Ok(())
}

pub fn export_zip(project: &Project) -> ApiResult<Vec<u8>> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    add_nodes(&mut zip, project, &project.list_tree()?, options)?;
    Ok(zip.finish().map_err(ApiError::internal)?.into_inner())
}

fn add_nodes(
    zip: &mut ZipWriter<Cursor<Vec<u8>>>,
    project: &Project,
    nodes: &[FileNode],
    options: SimpleFileOptions,
) -> ApiResult<()> {
    for node in nodes {
        if let Some(children) = &node.children {
            zip.add_directory(&node.path, options)
                .map_err(ApiError::internal)?;
            add_nodes(zip, project, children, options)?;
        } else if node.name != ".keep" {
            zip.start_file(&node.path, options)
                .map_err(ApiError::internal)?;
            zip.write_all(&project.read_bytes(&node.path)?)
                .map_err(ApiError::internal)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, Project) {
        let dir = tempfile::tempdir().unwrap();
        let p = Project::open(dir.path().to_path_buf()).unwrap();
        (dir, p)
    }

    /// Builds a zip in memory. A name ending in `/` becomes a folder entry.
    fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut z = ZipWriter::new(Cursor::new(Vec::new()));
        let o = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, data) in entries {
            if name.ends_with('/') {
                z.add_directory(*name, o).unwrap();
            } else {
                z.start_file(*name, o).unwrap();
                z.write_all(data).unwrap();
            }
        }
        z.finish().unwrap().into_inner()
    }

    #[test]
    fn safe_paths_normalize_and_reject_escapes() {
        assert_eq!(safe_zip_path("a/b.tex").as_deref(), Some("a/b.tex"));
        assert_eq!(safe_zip_path("a/./b//c.tex").as_deref(), Some("a/b/c.tex"));
        assert_eq!(safe_zip_path("a/b/../c.tex").as_deref(), Some("a/c.tex"));
        assert_eq!(safe_zip_path("dir/").as_deref(), Some("dir/"));
        for bad in [
            "../x",
            "a/../../x",
            "/etc/passwd",
            "a\\b",
            "",
            ".",
            "./",
            "..",
        ] {
            assert_eq!(safe_zip_path(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn wrapper_folder_is_detected_only_when_it_wraps_everything() {
        let v = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            strip_common_zip_root(&v(&["P/", "P/main.tex", "P/figs/a.png"])),
            "P"
        );
        assert_eq!(strip_common_zip_root(&v(&["main.tex", "figs/a.png"])), "");
        assert_eq!(strip_common_zip_root(&v(&["A/x.tex", "B/y.tex"])), "");
        assert_eq!(strip_common_zip_root(&v(&["main.tex"])), "");
        assert_eq!(strip_common_zip_root(&[]), "");
    }

    #[test]
    fn import_strips_wrapper_skips_junk_and_keeps_structure() {
        let (_d, p) = project();
        let zip = make_zip(&[
            ("My Paper/", b""),
            (
                "My Paper/main.tex",
                "\\documentclass{article} สวัสดี".as_bytes(),
            ),
            ("My Paper/figs/", b""),
            ("My Paper/figs/a.png", &[0x89, 0x50, 0x00, 0x01]),
            ("My Paper/.DS_Store", b"junk"),
            ("__MACOSX/My Paper/._main.tex", b"junk"),
        ]);
        import_zip(&p, &zip).unwrap();
        assert_eq!(
            p.read_text("main.tex").unwrap(),
            "\\documentclass{article} สวัสดี"
        );
        assert_eq!(p.read_bytes("figs/a.png").unwrap(), [0x89, 0x50, 0, 1]);
        assert!(!p.root().join("My Paper").exists());
        assert!(!p.root().join(".DS_Store").exists());
        assert!(!p.root().join("__MACOSX").exists());
    }

    #[test]
    fn import_never_writes_outside_the_project() {
        let (d, p) = project();
        let zip = make_zip(&[
            ("../evil.txt", b"x"),
            ("a/../../evil2.txt", b"x"),
            ("/abs/evil3.txt", b"x"),
            ("ok.tex", b"fine"),
        ]);
        import_zip(&p, &zip).unwrap();
        assert_eq!(p.read_text("ok.tex").unwrap(), "fine");
        let parent = d.path().parent().unwrap();
        assert!(!parent.join("evil.txt").exists() && !parent.join("evil2.txt").exists());
        assert!(!p.root().join("abs").exists());
    }

    #[test]
    fn import_rejects_garbage_and_too_many_entries() {
        let (_d, p) = project();
        assert_eq!(
            import_zip(&p, b"definitely not a zip").unwrap_err().status,
            StatusCode::BAD_REQUEST
        );

        let small = Limits {
            entries: 10,
            ..LIMITS
        };
        let names: Vec<String> = (0..11).map(|i| format!("f{i}.txt")).collect();
        let refs: Vec<(&str, &[u8])> = names.iter().map(|n| (n.as_str(), &b"x"[..])).collect();
        let err = import_zip_limited(&p, &make_zip(&refs), &small).unwrap_err();
        assert_eq!(
            (err.status, err.message.as_str()),
            (
                StatusCode::PAYLOAD_TOO_LARGE,
                "Archive has too many entries"
            )
        );
    }

    #[test]
    fn decompressed_size_is_measured_not_trusted() {
        // A megabyte of zeros deflates to ~1 KB: the zip-bomb shape, with small limits for speed.
        let (_d, p) = project();
        let limits = Limits {
            file_bytes: 64 * 1024,
            total_bytes: 200 * 1024,
            ..LIMITS
        };
        let bomb = make_zip(&[("big.bin", &vec![0u8; 1024 * 1024])]);
        assert!(
            bomb.len() < 8 * 1024,
            "the archive must be tiny on the wire: {}",
            bomb.len()
        );
        let err = import_zip_limited(&p, &bomb, &limits).unwrap_err();
        assert_eq!(
            (err.status, err.message.as_str()),
            (StatusCode::PAYLOAD_TOO_LARGE, "Archive entry too large")
        );
        assert!(!p.root().join("big.bin").exists());

        // Many entries, each under the per-file cap, but too much in total.
        let chunk = vec![1u8; 60 * 1024];
        let many = make_zip(&[
            ("a.bin", &chunk),
            ("b.bin", &chunk),
            ("c.bin", &chunk),
            ("d.bin", &chunk),
        ]);
        let err = import_zip_limited(&p, &many, &limits).unwrap_err();
        assert_eq!(
            (err.status, err.message.as_str()),
            (
                StatusCode::PAYLOAD_TOO_LARGE,
                "Archive too large when decompressed"
            )
        );
    }

    #[test]
    fn export_round_trips_and_leaves_out_internals() {
        let (_d, p) = project();
        p.write("main.tex", "สวัสดี".as_bytes()).unwrap();
        p.write("figs/a.png", &[1, 0, 2]).unwrap();
        p.write("figs/.keep", b"").unwrap();
        p.write(".somescript/tasks.json", b"[]").unwrap();
        p.write(".preview-cache/main.pdf", b"%PDF").unwrap();
        std::fs::create_dir(p.root().join("empty")).unwrap();

        let bytes = export_zip(&p).unwrap();
        let archive = ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut names: Vec<_> = archive
            .file_names()
            .map(|n| n.unwrap().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["empty/", "figs/", "figs/a.png", "main.tex"]);

        let (_d2, q) = project();
        import_zip(&q, &bytes).unwrap();
        assert_eq!(q.read_text("main.tex").unwrap(), "สวัสดี");
        assert_eq!(q.read_bytes("figs/a.png").unwrap(), [1, 0, 2]);
        assert!(q.root().join("empty").is_dir());
    }
}
