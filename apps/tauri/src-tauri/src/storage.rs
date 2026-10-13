//! Port of apps/editor/lib/storage.ts `LocalStorageProvider`, plus the invariants the
//! plan calls out: every path stays inside the project (lexically and via symlinks),
//! writes are temp-file + rename so autosave can never truncate a document, and the
//! tree hides the same internals the cloud editor hides.

use crate::error::{ApiError, ApiResult};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    cmp::Ordering,
    collections::HashSet,
    fs,
    io::{self, Write},
    path::{Component, Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::SystemTime,
};

/// Hidden from the file tree, search and export. The first seven mirror `EXCLUDED` in
/// apps/editor/lib/storage.ts; the rest is desktop OS litter.
pub const EXCLUDED: &[&str] = &[
    "node_modules",
    ".git",
    ".next",
    ".eve",
    ".workflow-data",
    ".somescript",
    ".preview-cache",
    ".DS_Store",
    "Thumbs.db",
];
const TMP_PREFIX: &str = ".somescript-tmp-";

// ponytail: one global write lock. Writes are tiny and local; go per-project if contention shows.
static WRITE_LOCK: Mutex<()> = Mutex::new(());
fn write_lock() -> MutexGuard<'static, ()> {
    WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

pub fn is_excluded(name: &str) -> bool {
    EXCLUDED.contains(&name) || name.starts_with(TMP_PREFIX)
}

/// `sha256:<hex>` over the UTF-8 text, the version token `writeFileIfVersion` compares.
pub fn content_version(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    format!(
        "sha256:{}",
        digest
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    )
}

/// NUL byte in the first 8 KB: the same heuristic git and grep -I use.
pub fn is_binary_content(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(8000)].contains(&0)
}

#[derive(Clone, Debug)]
pub struct Project {
    root: PathBuf,
}

impl Project {
    pub fn open(dir: PathBuf) -> io::Result<Self> {
        Ok(Self {
            root: dunce::canonicalize(dir)?,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Joins a project-relative path onto the root, rejecting anything that would leave it.
    pub fn resolve(&self, rel: &str) -> ApiResult<PathBuf> {
        let traversal = || ApiError::bad_request("Directory traversal attempt detected");
        if rel.contains(['\0', '\\']) || rel.starts_with('/') {
            return Err(ApiError::bad_request("Invalid path"));
        }
        let mut parts: Vec<&str> = Vec::new();
        for seg in rel.split('/') {
            match seg {
                "" | "." => {}
                ".." => {
                    parts.pop().ok_or_else(traversal)?;
                }
                s => {
                    // On Windows this also rejects drive prefixes like `C:`.
                    let mut c = Path::new(s).components();
                    if !(matches!(c.next(), Some(Component::Normal(_))) && c.next().is_none()) {
                        return Err(traversal());
                    }
                    parts.push(s);
                }
            }
        }
        let full = parts.iter().fold(self.root.clone(), |p, s| p.join(s));
        self.ensure_inside(&full)?;
        Ok(full)
    }

    fn resolve_not_root(&self, rel: &str) -> ApiResult<PathBuf> {
        let full = self.resolve(rel)?;
        if full == self.root {
            return Err(ApiError::bad_request("Invalid path"));
        }
        Ok(full)
    }

    /// Symlink-escape guard: the deepest existing ancestor must still canonicalize under
    /// the root. A dangling symlink fails to canonicalize and is rejected too.
    fn ensure_inside(&self, full: &Path) -> ApiResult<()> {
        let mut probe = full;
        while fs::symlink_metadata(probe).is_err() {
            match probe.parent() {
                Some(p) => probe = p,
                None => break,
            }
        }
        match dunce::canonicalize(probe) {
            Ok(c) if c.starts_with(&self.root) => Ok(()),
            _ => Err(ApiError::bad_request(
                "Directory traversal attempt detected",
            )),
        }
    }

    pub fn read_bytes(&self, rel: &str) -> ApiResult<Vec<u8>> {
        Ok(fs::read(self.resolve(rel)?)?)
    }

    /// Lossy like Node's `readFile(..., "utf-8")`, so versions agree with the cloud editor.
    pub fn read_text(&self, rel: &str) -> ApiResult<String> {
        Ok(String::from_utf8_lossy(&self.read_bytes(rel)?).into_owned())
    }

    pub fn read_text_versioned(&self, rel: &str) -> ApiResult<(String, String)> {
        let content = self.read_text(rel)?;
        let version = content_version(&content);
        Ok((content, version))
    }

    pub fn write(&self, rel: &str, data: &[u8]) -> ApiResult<()> {
        let _guard = write_lock();
        self.write_unlocked(rel, data)
    }

    /// Compare-and-swap on the current content's version. `false` = missing or changed.
    pub fn write_if_version(&self, rel: &str, expected: &str, content: &str) -> ApiResult<bool> {
        let _guard = write_lock();
        let full = self.resolve(rel)?;
        let current = match fs::read(&full) {
            Ok(b) => String::from_utf8_lossy(&b).into_owned(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e.into()),
        };
        if content_version(&current) != expected {
            return Ok(false);
        }
        self.write_unlocked(rel, content.as_bytes())?;
        Ok(true)
    }

    // ponytail: no fsync before the rename. Rename keeps a crash from truncating the file;
    // an OS crash can still drop the last save. Add sync_all() if that ever matters.
    fn write_unlocked(&self, rel: &str, data: &[u8]) -> ApiResult<()> {
        let full = self.resolve_not_root(rel)?;
        let dir = full
            .parent()
            .ok_or_else(|| ApiError::bad_request("Invalid path"))?;
        fs::create_dir_all(dir)?;
        self.ensure_inside(dir)?;
        let mut tmp = tempfile::Builder::new()
            .prefix(TMP_PREFIX)
            .tempfile_in(dir)?;
        tmp.write_all(data)?;
        #[cfg(unix)]
        {
            // tempfile creates 0600; keep the existing file's mode, or a normal 0644.
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&full)
                .map(|m| m.permissions().mode())
                .unwrap_or(0o644);
            fs::set_permissions(tmp.path(), fs::Permissions::from_mode(mode & 0o7777))?;
        }
        tmp.persist(&full).map_err(|e| ApiError::from(e.error))?;
        Ok(())
    }

    pub fn create_dir(&self, rel: &str) -> ApiResult<()> {
        fs::create_dir_all(self.resolve(rel)?)?;
        Ok(())
    }

    pub fn move_path(&self, old: &str, new: &str) -> ApiResult<()> {
        let _guard = write_lock();
        let from = self.resolve_not_root(old)?;
        let to = self.resolve_not_root(new)?;
        if to != from && to.starts_with(&from) {
            return Err(ApiError::bad_request("Cannot move a folder into itself"));
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(from, to)?;
        Ok(())
    }

    pub fn copy_path(&self, src: &str, dest: &str) -> ApiResult<()> {
        let _guard = write_lock();
        let from = self.resolve_not_root(src)?;
        let to = self.resolve_not_root(dest)?;
        if to.starts_with(&from) {
            return Err(ApiError::bad_request("Cannot copy a folder into itself"));
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        copy_recursive(&from, &to)?;
        Ok(())
    }

    /// Like `rm -rf`: a missing path is fine. The project root itself is never deletable.
    pub fn delete_path(&self, rel: &str) -> ApiResult<()> {
        let _guard = write_lock();
        let full = self.resolve_not_root(rel)?;
        match fs::symlink_metadata(&full) {
            Ok(m) if m.is_dir() => fs::remove_dir_all(&full)?,
            Ok(_) => fs::remove_file(&full)?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        Ok(())
    }

    pub fn list_tree(&self) -> io::Result<Vec<FileNode>> {
        scan(&self.root, "")
    }

    /// Marks the project as just modified. The library sorts by this, and a file edit
    /// doesn't change the project folder's own mtime. Best-effort.
    pub fn touch(&self) {
        let dir = self.root.join(".somescript");
        let _ = fs::create_dir_all(&dir);
        if let Ok(f) = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(dir.join("updated"))
        {
            let _ = f.set_modified(SystemTime::now());
        }
    }

    pub fn updated_at(&self) -> Option<SystemTime> {
        let mtime = |p: PathBuf| fs::metadata(p).and_then(|m| m.modified()).ok();
        mtime(self.root.join(".somescript/updated")).or_else(|| mtime(self.root.clone()))
    }
}

/// Copies a file or folder tree; symlinks are skipped (see below).
pub fn copy_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(src)?;
    if meta.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        fs::copy(src, dst)?;
    } // symlinks are skipped: copying one could pull in files from outside the project.
    Ok(())
}

fn scan(dir: &Path, rel_root: &str) -> io::Result<Vec<FileNode>> {
    let entries = fs::read_dir(dir)?.collect::<io::Result<Vec<_>>>()?;
    let name_of = |e: &fs::DirEntry| e.file_name().to_string_lossy().into_owned();
    // Hide a compiled main.pdf next to main.tex, but not a genuine PDF figure: those never
    // share a same-directory basename with a .tex file.
    let tex_stems: HashSet<String> = entries
        .iter()
        .filter_map(|e| name_of(e).strip_suffix(".tex").map(str::to_owned))
        .collect();

    let mut nodes = Vec::new();
    for entry in &entries {
        let name = name_of(entry);
        if is_excluded(&name) {
            continue;
        }
        if name
            .strip_suffix(".pdf")
            .is_some_and(|stem| tex_stems.contains(stem))
        {
            continue;
        }
        let path = if rel_root.is_empty() {
            name.clone()
        } else {
            format!("{rel_root}/{name}")
        };
        if entry.file_type()?.is_dir() {
            let children = scan(&entry.path(), &path)?;
            nodes.push(FileNode {
                name,
                path,
                is_dir: true,
                children: Some(children),
            });
        } else {
            nodes.push(FileNode {
                name,
                path,
                is_dir: false,
                children: None,
            });
        }
    }
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => locale_cmp(&a.name, &b.name),
    });
    Ok(nodes)
}

/// Approximates JS `localeCompare` for file names: case-insensitive, lowercase first on ties.
fn locale_cmp(a: &str, b: &str) -> Ordering {
    a.to_lowercase()
        .cmp(&b.to_lowercase())
        .then_with(|| b.cmp(a))
}

/// Every node's path in a tree, for O(1) collision checks.
pub fn flatten_file_paths(nodes: &[FileNode], out: &mut HashSet<String>) {
    for node in nodes {
        out.insert(node.path.clone());
        if let Some(children) = &node.children {
            flatten_file_paths(children, out);
        }
    }
}

/// Port of lib/zip.ts `dedupeUploadName`: `name` under `target_dir` that isn't taken,
/// appending -1, -2, ... before the extension. Never overwrites.
pub fn dedupe_upload_name(existing: &HashSet<String>, target_dir: &str, name: &str) -> String {
    let join = |n: &str| {
        if target_dir.is_empty() {
            n.to_owned()
        } else {
            format!("{target_dir}/{n}")
        }
    };
    if !existing.contains(&join(name)) {
        return join(name);
    }
    let (base, ext) = match name.rfind('.') {
        Some(i) if i > 0 => name.split_at(i),
        _ => (name, ""),
    };
    (1..)
        .map(|n| join(&format!("{base}-{n}{ext}")))
        .find(|candidate| !existing.contains(candidate))
        .expect("unbounded range always yields a free name")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, Project) {
        let dir = tempfile::tempdir().unwrap();
        let p = Project::open(dir.path().to_path_buf()).unwrap();
        (dir, p)
    }

    #[test]
    fn resolve_rejects_everything_that_leaves_the_project() {
        let (_d, p) = project();
        for bad in ["../x", "a/../../x", "/etc/passwd", "a\\b", "a\0b"] {
            assert!(p.resolve(bad).is_err(), "{bad:?} should be rejected");
        }
        assert_eq!(
            p.resolve("a/./b/../c.tex").unwrap(),
            p.root().join("a/c.tex")
        );
        assert_eq!(p.resolve("").unwrap(), p.root());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_cannot_escape_the_project() {
        let (_d, p) = project();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), p.root().join("link")).unwrap();
        assert!(p.write("link/evil.txt", b"x").is_err());
        assert!(!outside.path().join("evil.txt").exists());
        // Dangling link at the leaf is rejected too, not written through.
        std::os::unix::fs::symlink(outside.path().join("nope"), p.root().join("dangling")).unwrap();
        assert!(p.write("dangling", b"x").is_err());
        assert!(!outside.path().join("nope").exists());
    }

    #[test]
    fn write_is_atomic_creates_parents_and_leaves_no_temp_files() {
        let (_d, p) = project();
        p.write("chapters/one.tex", b"hello").unwrap();
        p.write("chapters/one.tex", b"hello again").unwrap();
        assert_eq!(p.read_text("chapters/one.tex").unwrap(), "hello again");
        let names: Vec<_> = fs::read_dir(p.root().join("chapters"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["one.tex"]);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(p.root().join("chapters/one.tex"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o644);
        }
    }

    #[test]
    fn write_if_version_is_compare_and_swap() {
        let (_d, p) = project();
        assert!(
            !p.write_if_version("missing.tex", "sha256:x", "new")
                .unwrap()
        );
        p.write("a.tex", b"one").unwrap();
        let (_, v1) = p.read_text_versioned("a.tex").unwrap();
        assert!(p.write_if_version("a.tex", &v1, "two").unwrap());
        // The old version is now stale.
        assert!(!p.write_if_version("a.tex", &v1, "three").unwrap());
        assert_eq!(p.read_text("a.tex").unwrap(), "two");
    }

    #[test]
    fn version_matches_the_cloud_editors_sha256_format() {
        assert_eq!(
            content_version(""),
            "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn delete_never_removes_the_project_root_but_tolerates_missing_paths() {
        let (_d, p) = project();
        p.write("keep/a.tex", b"x").unwrap();
        assert!(p.delete_path("").is_err());
        assert!(p.delete_path(".").is_err());
        assert!(p.delete_path("keep/..").is_err());
        assert!(p.root().join("keep/a.tex").exists());
        p.delete_path("nope.tex").unwrap();
        p.delete_path("keep").unwrap();
        assert!(!p.root().join("keep").exists());
    }

    #[test]
    fn move_and_copy_refuse_to_nest_a_folder_in_itself() {
        let (_d, p) = project();
        p.write("d/a.tex", b"x").unwrap();
        assert!(p.move_path("d", "d/sub").is_err());
        assert!(p.copy_path("d", "d/sub").is_err());
        p.copy_path("d", "e").unwrap();
        assert_eq!(p.read_text("e/a.tex").unwrap(), "x");
        p.move_path("e/a.tex", "f/b.tex").unwrap();
        assert!(p.read_text("e/a.tex").is_err());
        assert_eq!(p.read_text("f/b.tex").unwrap(), "x");
    }

    #[test]
    fn tree_hides_internals_and_compiled_pdf_but_keeps_figures() {
        let (_d, p) = project();
        for f in [
            "main.tex",
            "main.pdf",
            "fig.pdf",
            "refs.bib",
            ".DS_Store",
            ".somescript/tasks.json",
            ".preview-cache/main.pdf",
            "node_modules/x/y.js",
            "Zeta/intro.tex",
            "alpha/b.tex",
            "Alpha-2.tex",
        ] {
            p.write(f, b"x").unwrap();
        }
        fs::create_dir(p.root().join("empty")).unwrap();
        let tree = p.list_tree().unwrap();
        let names: Vec<_> = tree.iter().map(|n| (n.name.as_str(), n.is_dir)).collect();
        // Directories first, then files, each sorted case-insensitively.
        assert_eq!(
            names,
            [
                ("alpha", true),
                ("empty", true),
                ("Zeta", true),
                ("Alpha-2.tex", false),
                ("fig.pdf", false),
                ("main.tex", false),
                ("refs.bib", false)
            ]
        );
        let json = serde_json::to_value(&tree).unwrap();
        assert_eq!(json[1]["children"], serde_json::json!([])); // empty dir keeps `children`
        assert!(json[3].get("children").is_none()); // files omit it
        assert_eq!(json[2]["children"][0]["path"], "Zeta/intro.tex");
        assert_eq!(json[2]["children"][0]["isDir"], false);
    }

    #[test]
    fn locale_cmp_is_case_insensitive_with_lowercase_first_on_ties() {
        // Not testable via real files: macOS's filesystem can't hold both spellings.
        assert_eq!(locale_cmp("a", "B"), Ordering::Less);
        assert_eq!(locale_cmp("B", "a"), Ordering::Greater);
        assert_eq!(locale_cmp("sections", "Sections"), Ordering::Less); // ICU localeCompare agrees
        assert_eq!(locale_cmp("x", "x"), Ordering::Equal);
    }

    #[test]
    fn binary_sniffing_looks_only_at_the_first_8kb() {
        assert!(is_binary_content(b"ab\0cd"));
        assert!(!is_binary_content("สวัสดี".as_bytes()));
        let mut late = vec![b'a'; 9000];
        late[8500] = 0;
        assert!(!is_binary_content(&late));
    }

    #[test]
    fn dedupe_never_overwrites() {
        let mut existing = HashSet::new();
        existing.insert("figs/a.png".to_owned());
        existing.insert("figs/a-1.png".to_owned());
        assert_eq!(dedupe_upload_name(&existing, "figs", "b.png"), "figs/b.png");
        assert_eq!(
            dedupe_upload_name(&existing, "figs", "a.png"),
            "figs/a-2.png"
        );
        existing.insert("README".to_owned());
        assert_eq!(dedupe_upload_name(&existing, "", "README"), "README-1");
        existing.insert(".env".to_owned());
        assert_eq!(dedupe_upload_name(&existing, "", ".env"), ".env-1");
    }
}
