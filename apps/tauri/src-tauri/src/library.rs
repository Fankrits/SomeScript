//! The library is a plain folder; every subfolder is a project and its name is the
//! project id. No database or index to drift out of sync with what's on disk, and users
//! can manage projects in Finder/Explorer. Deleted projects move to `.trash/` for a week.

use crate::{
    error::{ApiError, ApiResult},
    storage::Project,
};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs, io,
    path::{Component, Path, PathBuf},
    sync::RwLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const TRASH_DIR: &str = ".trash";
/// Same retention as TRASH_RETENTION_DAYS in apps/web/lib/trash.ts.
pub const TRASH_RETENTION: Duration = Duration::from_secs(7 * 86_400);
// Folder names stay well under the 255-byte limit even after a " 12" de-dup suffix.
const MAX_NAME_BYTES: usize = 200;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: String,
    pub name: String,
    /// Milliseconds since the epoch.
    pub updated_at: u64,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrashedInfo {
    /// Opaque: the folder name inside `.trash/`.
    pub id: String,
    pub name: String,
    pub deleted_at: u64,
    pub purge_at: u64,
}

pub struct Library {
    root: RwLock<PathBuf>,
}

fn millis(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root: RwLock::new(root),
        }
    }

    pub fn root(&self) -> PathBuf {
        self.root.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_root(&self, root: PathBuf) {
        *self.root.write().unwrap_or_else(|e| e.into_inner()) = root;
    }

    fn trash_root(&self) -> PathBuf {
        self.root().join(TRASH_DIR)
    }

    /// Resolves a `projectId` request parameter to an existing project folder.
    pub fn project(&self, id: Option<&str>) -> ApiResult<Project> {
        let id = id
            .filter(|id| valid_project_id(id))
            .ok_or_else(|| ApiError::bad_request("Invalid projectId"))?;
        let dir = self.root().join(id);
        if !dir.is_dir() {
            return Err(ApiError::not_found("Project not found"));
        }
        Ok(Project::open(dir)?)
    }

    /// Projects, most recently edited first.
    pub fn list(&self) -> io::Result<Vec<ProjectInfo>> {
        let mut out = Vec::new();
        for entry in fs::read_dir(self.root())? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if !valid_project_id(&name) || !entry.file_type()?.is_dir() {
                continue;
            }
            let updated = Project::open(entry.path())
                .ok()
                .and_then(|p| p.updated_at());
            out.push(ProjectInfo {
                id: name.clone(),
                name,
                updated_at: updated.map_or(0, millis),
            });
        }
        out.sort_by(|a, b| {
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(out)
    }

    /// A free folder name for `wanted`: sanitized, then "Name 2", "Name 3", ... on collision.
    /// Collisions are case-insensitive because macOS and Windows folders are.
    /// `ignore` is a name that doesn't count as taken (the project being renamed).
    pub fn unique_name(&self, wanted: &str, ignore: Option<&str>) -> String {
        let taken: HashSet<String> = fs::read_dir(self.root())
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_lowercase())
            .collect();
        let ignore = ignore.map(str::to_lowercase);
        let is_taken = |n: &str| {
            let n = n.to_lowercase();
            taken.contains(&n) && ignore.as_deref() != Some(n.as_str())
        };
        let base = folder_name_from(wanted);
        if !is_taken(&base) {
            return base;
        }
        (2..)
            .map(|n| format!("{base} {n}"))
            .find(|candidate| !is_taken(candidate))
            .expect("unbounded range always yields a free name")
    }

    /// Creates an empty project folder named after `name`; returns its id.
    pub fn create(&self, name: &str) -> ApiResult<String> {
        if name.trim().is_empty() {
            return Err(ApiError::bad_request("Project name is required"));
        }
        let id = self.unique_name(name, None);
        fs::create_dir(self.root().join(&id))?;
        Ok(id)
    }

    /// Renames the project's folder; returns the new id.
    pub fn rename(&self, id: &str, new_name: &str) -> ApiResult<String> {
        if new_name.trim().is_empty() {
            return Err(ApiError::bad_request("Project name is required"));
        }
        self.project(Some(id))?;
        let new_id = self.unique_name(new_name, Some(id));
        if new_id != id {
            fs::rename(self.root().join(id), self.root().join(&new_id))?;
        }
        Ok(new_id)
    }

    /// Moves a project to the trash. Its files are kept until it is purged.
    pub fn trash(&self, id: &str) -> ApiResult<()> {
        self.project(Some(id))?;
        let trash = self.trash_root();
        fs::create_dir_all(&trash)?;
        let stamp = millis(SystemTime::now());
        let dest = (0..)
            .map(|n| trash.join(format!("{id}~{}", stamp + n)))
            .find(|p| !p.exists())
            .expect("unbounded range always yields a free name");
        fs::rename(self.root().join(id), dest)?;
        Ok(())
    }

    pub fn list_trash(&self) -> io::Result<Vec<TrashedInfo>> {
        let mut out = Vec::new();
        let Ok(entries) = fs::read_dir(self.trash_root()) else {
            return Ok(out);
        };
        for entry in entries {
            let entry = entry?;
            let id = entry.file_name().to_string_lossy().into_owned();
            let (name, deleted) = match id
                .rsplit_once('~')
                .and_then(|(n, ms)| Some((n, ms.parse::<u64>().ok()?)))
            {
                Some((n, ms)) => (n.to_owned(), ms),
                // Not one of ours: age it from the folder's own mtime rather than hide or keep it forever.
                None => (id.clone(), entry.metadata()?.modified().map_or(0, millis)),
            };
            out.push(TrashedInfo {
                id,
                name,
                deleted_at: deleted,
                purge_at: deleted + TRASH_RETENTION.as_millis() as u64,
            });
        }
        out.sort_by_key(|t| std::cmp::Reverse(t.deleted_at));
        Ok(out)
    }

    fn trashed_dir(&self, trash_id: &str) -> ApiResult<PathBuf> {
        if !is_plain_segment(trash_id) {
            return Err(ApiError::bad_request("Invalid trash id"));
        }
        let dir = self.trash_root().join(trash_id);
        if !dir.is_dir() {
            return Err(ApiError::not_found("Project not found in trash"));
        }
        Ok(dir)
    }

    /// Brings a trashed project back (under a new name if its old one is taken now).
    pub fn restore(&self, trash_id: &str) -> ApiResult<String> {
        let dir = self.trashed_dir(trash_id)?;
        let original = trash_id.rsplit_once('~').map_or(trash_id, |(n, _)| n);
        let id = self.unique_name(original, None);
        fs::rename(dir, self.root().join(&id))?;
        Ok(id)
    }

    pub fn purge(&self, trash_id: &str) -> ApiResult<()> {
        fs::remove_dir_all(self.trashed_dir(trash_id)?)?;
        Ok(())
    }

    /// Deletes trash older than the retention window; returns how many were removed.
    pub fn purge_expired(&self, now: SystemTime) -> usize {
        let now = millis(now);
        let Ok(items) = self.list_trash() else {
            return 0;
        };
        items
            .into_iter()
            .filter(|t| t.purge_at <= now)
            .filter(|t| fs::remove_dir_all(self.trash_root().join(&t.id)).is_ok())
            .count()
    }
}

fn is_plain_segment(s: &str) -> bool {
    if s.is_empty() || s.len() > 300 || s.contains(['/', '\\', '\0']) {
        return false;
    }
    let mut parts = Path::new(s).components();
    matches!(parts.next(), Some(Component::Normal(_))) && parts.next().is_none()
}

/// One plain path segment: no separators, no traversal, and no leading dot (which also
/// keeps `.trash` and other library-internal folders unreachable as projects).
pub fn valid_project_id(id: &str) -> bool {
    id.len() <= 255 && !id.starts_with('.') && is_plain_segment(id)
}

/// A filesystem-safe folder name for a human-typed project name.
pub fn folder_name_from(name: &str) -> String {
    let swapped: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '-'
            } else {
                c
            }
        })
        .collect();
    // Windows forbids trailing dots/spaces, and a leading dot would hide the folder.
    let edge = |c: char| c == '.' || c.is_whitespace();
    let mut cleaned = String::new();
    for c in swapped.trim_matches(edge).chars() {
        if cleaned.len() + c.len_utf8() > MAX_NAME_BYTES {
            break;
        }
        cleaned.push(c);
    }
    let cleaned = cleaned.trim_matches(edge);
    if cleaned.is_empty() {
        return "Untitled".to_owned();
    }
    let stem = cleaned
        .split('.')
        .next()
        .unwrap_or(cleaned)
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|p| {
            stem.strip_prefix(p)
                .is_some_and(|d| d.len() == 1 && d.as_bytes()[0].is_ascii_digit() && d != "0")
        });
    if reserved {
        format!("_{cleaned}")
    } else {
        cleaned.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lib() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let l = Library::new(dir.path().to_path_buf());
        (dir, l)
    }

    #[test]
    fn project_ids_are_single_plain_segments() {
        for ok in ["My Thesis", "paper-2", "วิทยานิพนธ์", "a.b"] {
            assert!(valid_project_id(ok), "{ok}");
        }
        for bad in [
            "", ".", "..", ".trash", "../x", "a/b", "a\\b", "/etc", "a\0b",
        ] {
            assert!(!valid_project_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn folder_names_are_safe_on_every_filesystem() {
        assert_eq!(folder_name_from("My Thesis"), "My Thesis");
        assert_eq!(
            folder_name_from("  a/b\\c:d*e?f\"g<h>i|j  "),
            "a-b-c-d-e-f-g-h-i-j"
        );
        assert_eq!(folder_name_from("..hidden.."), "hidden");
        assert_eq!(folder_name_from("   "), "Untitled");
        assert_eq!(folder_name_from("..."), "Untitled");
        assert_eq!(folder_name_from("con"), "_con");
        assert_eq!(folder_name_from("NUL.txt"), "_NUL.txt");
        assert_eq!(folder_name_from("com1"), "_com1");
        assert_eq!(folder_name_from("com0"), "com0");
        assert_eq!(folder_name_from("console"), "console");
        assert_eq!(folder_name_from("วิทยานิพนธ์ ป.โท"), "วิทยานิพนธ์ ป.โท");
        // Thai is 3 bytes per char: truncation must respect the byte limit and char boundaries.
        let long = folder_name_from(&"ก".repeat(500));
        assert!(long.len() <= MAX_NAME_BYTES && long.chars().all(|c| c == 'ก'));
        assert!(valid_project_id(&folder_name_from("a/b")));
    }

    #[test]
    fn create_dedupes_case_insensitively() {
        let (_d, l) = lib();
        assert_eq!(l.create("Paper").unwrap(), "Paper");
        assert_eq!(l.create("Paper").unwrap(), "Paper 2");
        assert_eq!(l.create("paper").unwrap(), "paper 3");
        assert_eq!(l.create("a/b").unwrap(), "a-b");
        assert!(l.create("   ").is_err());
    }

    #[test]
    fn rename_moves_the_folder_and_ignores_itself_when_checking_collisions() {
        let (_d, l) = lib();
        l.create("One").unwrap();
        l.create("Two").unwrap();
        assert_eq!(l.rename("One", "Three").unwrap(), "Three");
        assert!(l.project(Some("One")).is_err());
        assert!(l.project(Some("Three")).is_ok());
        assert_eq!(l.rename("Three", "two").unwrap(), "two 2"); // collides with Two
        assert_eq!(l.rename("Two", "TWO").unwrap(), "TWO"); // case-only change of itself is fine
        assert_eq!(l.rename("TWO", "TWO").unwrap(), "TWO");
        assert!(l.rename("TWO", " ").is_err());
        assert_eq!(
            l.rename("nope", "x").unwrap_err().status,
            axum::http::StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn list_skips_hidden_folders_and_files_and_sorts_by_recent_edit() {
        let (d, l) = lib();
        for n in ["old", "new"] {
            l.create(n).unwrap();
        }
        fs::create_dir(d.path().join(".trash")).unwrap();
        fs::write(d.path().join("notes.txt"), "x").unwrap();
        l.project(Some("old")).unwrap().touch();
        std::thread::sleep(Duration::from_millis(30));
        l.project(Some("new")).unwrap().touch();

        let listed = l.list().unwrap();
        let names: Vec<_> = listed.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(
            names,
            ["new", "old"],
            "hidden folders and loose files are not projects"
        );
        assert!(listed[0].updated_at > listed[1].updated_at);
        assert_eq!(listed[0].id, listed[0].name);
    }

    #[test]
    fn trash_restore_and_purge() {
        let (d, l) = lib();
        l.create("Thesis").unwrap();
        l.project(Some("Thesis"))
            .unwrap()
            .write("main.tex", b"keep me")
            .unwrap();

        l.trash("Thesis").unwrap();
        assert!(l.project(Some("Thesis")).is_err());
        assert!(
            l.list().unwrap().is_empty(),
            "trashed projects leave the library"
        );
        let trashed = l.list_trash().unwrap();
        assert_eq!(trashed.len(), 1);
        assert_eq!(trashed[0].name, "Thesis");
        assert_eq!(
            trashed[0].purge_at - trashed[0].deleted_at,
            TRASH_RETENTION.as_millis() as u64
        );

        // The name was reused while it sat in the trash: restore must not clobber it.
        l.create("Thesis").unwrap();
        let id = l.restore(&trashed[0].id).unwrap();
        assert_eq!(id, "Thesis 2");
        assert_eq!(
            l.project(Some(&id)).unwrap().read_text("main.tex").unwrap(),
            "keep me"
        );
        assert!(l.list_trash().unwrap().is_empty());

        l.trash("Thesis 2").unwrap();
        let tid = l.list_trash().unwrap().remove(0).id;
        l.purge(&tid).unwrap();
        assert!(l.list_trash().unwrap().is_empty());
        assert!(!d.path().join(".trash").join(&tid).exists());
    }

    #[test]
    fn trash_ids_cannot_escape_the_trash_folder() {
        let (d, l) = lib();
        fs::create_dir(d.path().join("precious")).unwrap();
        for bad in ["../precious", "..", "a/b", ""] {
            assert!(l.purge(bad).is_err(), "{bad:?}");
            assert!(l.restore(bad).is_err(), "{bad:?}");
        }
        assert!(d.path().join("precious").exists());
    }

    #[test]
    fn expired_trash_is_swept_but_recent_trash_is_kept() {
        let (d, l) = lib();
        l.create("fresh").unwrap();
        l.trash("fresh").unwrap();
        let trash = d.path().join(".trash");
        let day = 86_400_000u64;
        let now = millis(SystemTime::now());
        fs::create_dir(trash.join(format!("stale~{}", now - 8 * day))).unwrap();
        fs::create_dir(trash.join(format!("recent~{}", now - 6 * day))).unwrap();

        assert_eq!(l.purge_expired(SystemTime::now()), 1);
        let left: Vec<_> = l
            .list_trash()
            .unwrap()
            .into_iter()
            .map(|t| t.name)
            .collect();
        assert_eq!(left.len(), 2);
        assert!(left.contains(&"fresh".to_owned()) && left.contains(&"recent".to_owned()));
        // 8 days later everything is past retention.
        assert_eq!(
            l.purge_expired(SystemTime::now() + Duration::from_secs(8 * 86_400)),
            2
        );
    }
}
