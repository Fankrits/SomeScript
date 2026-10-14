//! The library is a plain folder; every subfolder is a project and its name is the
//! project id. No database or index to drift out of sync with what's on disk, and users
//! can manage projects in Finder/Explorer. Deleted projects move to `.trash/` for a week.

use crate::{
    error::{ApiError, ApiResult, Os, explain},
    fsutil::retry_busy,
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

/// The folder name the app proposes inside Documents.
const APP_DIR: &str = "SomeScript";

/// Why the library is where it is.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RootSource {
    /// `SOMESCRIPT_LIBRARY` (developers, tests, portable use).
    Env,
    /// A folder the user chose in setup or Settings.
    Saved,
    /// `<Documents>/SomeScript`.
    Default,
    /// The default, when the OS couldn't say where Documents is (home folder, then app data).
    Fallback,
}

impl RootSource {
    /// A folder the app owns (its default, or an explicit override) is created on demand. One the
    /// user chose is not: if it has vanished (a moved folder, an unplugged drive) they must be told,
    /// not handed a fresh empty copy that looks like their projects were lost.
    pub fn creates_on_demand(self) -> bool {
        self != RootSource::Saved
    }
}

/// The outcome of [`resolve_root`].
#[derive(Debug, PartialEq)]
pub struct Resolved {
    pub root: PathBuf,
    pub source: RootSource,
    /// What setup proposes: where the library would be with nothing chosen.
    pub default: PathBuf,
}

/// Decides where the library lives: `SOMESCRIPT_LIBRARY`, then the folder saved by the user, then
/// `<Documents>/SomeScript`. Never a relative path (it would land in whatever the working directory
/// is, often unwritable): when the OS can't say where Documents is, the home folder and then the
/// app's own data folder stand in. Pure, so every platform's chain is unit-tested.
pub fn resolve_root(
    env: Option<PathBuf>,
    saved: Option<PathBuf>,
    documents: Option<PathBuf>,
    home: Option<PathBuf>,
    local_data: Option<PathBuf>,
) -> Resolved {
    let absolute = |p: PathBuf| std::path::absolute(&p).unwrap_or(p);
    let (default, default_source) = match (documents, home, local_data) {
        (Some(docs), ..) => (docs.join(APP_DIR), RootSource::Default),
        (None, Some(home), _) => (home.join(APP_DIR), RootSource::Fallback),
        (None, None, Some(data)) => (data.join("Projects"), RootSource::Fallback),
        (None, None, None) => (absolute(PathBuf::from(APP_DIR)), RootSource::Fallback),
    };
    let (root, source) = match (env, saved) {
        (Some(env), _) => (absolute(env), RootSource::Env),
        (None, Some(saved)) => (absolute(saved), RootSource::Saved),
        (None, None) => (default.clone(), default_source),
    };
    Resolved {
        root,
        source,
        default,
    }
}

/// Places to offer when the chosen folder can't be used: in the home folder, which neither Windows'
/// Controlled folder access nor macOS' privacy prompts protect, then in the app's own data folder.
pub fn alternative_places(home: Option<&Path>, local_data: Option<&Path>) -> Vec<PathBuf> {
    [
        home.map(|h| h.join(APP_DIR)),
        local_data.map(|d| d.join("Projects")),
    ]
    .into_iter()
    .flatten()
    .collect()
}

struct Location {
    root: PathBuf,
    source: RootSource,
}

pub struct Library {
    location: RwLock<Location>,
}

fn millis(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Library {
    /// A library at an explicitly given folder, the way `SOMESCRIPT_LIBRARY` gives one.
    #[cfg(test)]
    pub fn new(root: PathBuf) -> Self {
        Self::with_source(root, RootSource::Env)
    }

    pub fn with_source(root: PathBuf, source: RootSource) -> Self {
        Self {
            location: RwLock::new(Location { root, source }),
        }
    }

    fn location(&self) -> std::sync::RwLockReadGuard<'_, Location> {
        self.location.read().unwrap_or_else(|e| e.into_inner())
    }

    pub fn root(&self) -> PathBuf {
        self.location().root.clone()
    }

    pub fn source(&self) -> RootSource {
        self.location().source
    }

    pub fn set_root(&self, root: PathBuf, source: RootSource) {
        *self.location.write().unwrap_or_else(|e| e.into_inner()) = Location { root, source };
    }

    /// The library folder, created first if it is the app's own and missing (see
    /// [`RootSource::creates_on_demand`]). Called wherever a project is about to be added, so a
    /// folder that could not be made at startup (a permission prompt that was refused, a protected
    /// Documents folder) is retried with the real reason, instead of failing later as "not found".
    pub fn ensure_root(&self) -> ApiResult<PathBuf> {
        let (root, source) = (self.root(), self.source());
        if source.creates_on_demand() {
            fs::create_dir_all(&root)
                .map_err(|e| ApiError::io_at("Couldn't create the library folder", &root, &e))?;
        } else if let Err(e) = fs::metadata(&root).and_then(|m| {
            m.is_dir()
                .then_some(())
                .ok_or_else(|| io::Error::from(io::ErrorKind::NotADirectory))
        }) {
            return Err(ApiError::io_at("Can't use the library folder", &root, &e));
        }
        Ok(root)
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
        let root = self.ensure_root()?;
        // `unique_name` only looks. Another process, or a name that differs only by case, can still
        // win the race, so a name that turns out to be taken just means "look again".
        for _ in 0..50 {
            let dir = root.join(self.unique_name(name, None));
            match fs::create_dir(&dir) {
                Ok(()) => return Ok(folder_id(&dir)),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => {
                    return Err(ApiError::io_at(
                        "Couldn't create the project folder",
                        &dir,
                        &e,
                    ));
                }
            }
        }
        Err(ApiError::conflict(
            "Couldn't find a free name for the project folder. Try a different name.",
        ))
    }

    /// Renames the project's folder; returns the new id.
    pub fn rename(&self, id: &str, new_name: &str) -> ApiResult<String> {
        if new_name.trim().is_empty() {
            return Err(ApiError::bad_request("Project name is required"));
        }
        self.project(Some(id))?;
        let new_id = self.unique_name(new_name, Some(id));
        if new_id != id {
            let from = self.root().join(id);
            let to = self.root().join(&new_id);
            retry_busy(|| fs::rename(&from, &to))
                .map_err(|e| ApiError::io_at("Couldn't rename the project folder", &from, &e))?;
        }
        Ok(new_id)
    }

    /// Moves a project to the trash. Its files are kept until it is purged.
    pub fn trash(&self, id: &str) -> ApiResult<()> {
        self.project(Some(id))?;
        let trash = self.trash_root();
        fs::create_dir_all(&trash)
            .map_err(|e| ApiError::io_at("Couldn't create the trash folder", &trash, &e))?;
        let stamp = millis(SystemTime::now());
        let dest = (0..)
            .map(|n| trash.join(format!("{id}~{}", stamp + n)))
            .find(|p| !p.exists())
            .expect("unbounded range always yields a free name");
        let from = self.root().join(id);
        retry_busy(|| fs::rename(&from, &dest))
            .map_err(|e| ApiError::io_at("Couldn't move the project to the trash", &from, &e))?;
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
        let to = self.root().join(&id);
        retry_busy(|| fs::rename(&dir, &to))
            .map_err(|e| ApiError::io_at("Couldn't restore the project", &dir, &e))?;
        Ok(id)
    }

    pub fn purge(&self, trash_id: &str) -> ApiResult<()> {
        let dir = self.trashed_dir(trash_id)?;
        retry_busy(|| fs::remove_dir_all(&dir))
            .map_err(|e| ApiError::io_at("Couldn't delete the project", &dir, &e))?;
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

// ---- Checking a folder before it is used ---------------------------------------------------

/// Why a folder can't be used.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IssueKind {
    /// Not a full path (`C:\...`, `/...`).
    NotAbsolute,
    /// A file is there, or in the way.
    NotAFolder,
    /// The OS refuses writes: Windows' Controlled folder access, macOS privacy, plain permissions.
    Permission,
    /// Nothing there and nothing to create it in (a drive that isn't connected).
    Unavailable,
    Other,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Issue {
    pub kind: IssueKind,
    pub message: String,
    pub hint: Option<String>,
}

/// Something worth knowing about a folder that doesn't stop it being used.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WarningKind {
    /// OneDrive, Dropbox, iCloud...: syncing can hold files while they are being saved.
    CloudSynced,
    NetworkShare,
    /// Program Files, /Applications: an update or uninstall can take projects with it.
    InstallFolder,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Warning {
    pub kind: WarningKind,
    pub message: String,
}

/// What setup and Settings need to know about a folder before choosing it.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderCheck {
    /// The path as the user should see it (no `\\?\` prefix).
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    /// Proven by writing a file there and removing it again.
    pub writable: bool,
    /// Doesn't exist yet, but the nearest folder that does can be written to.
    pub creatable: bool,
    /// Subfolders that would show up as projects.
    pub project_count: usize,
    pub issue: Option<Issue>,
    pub warnings: Vec<Warning>,
    /// Other places that work, offered only when this one doesn't.
    pub alternatives: Vec<String>,
}

/// Creates and removes a file in `dir`. Only a real write proves a folder is writable: permission
/// bits and attributes don't show Windows' Controlled folder access or an antivirus block.
pub fn probe_writable(dir: &Path) -> io::Result<()> {
    tempfile::Builder::new()
        .prefix(".somescript-write-test-")
        .tempfile_in(dir)
        .map(drop)
}

fn example_path(os: Os) -> &'static str {
    match os {
        Os::Windows => r"C:\Users\you\SomeScript",
        Os::Mac => "/Users/you/SomeScript",
        Os::Other => "/home/you/SomeScript",
    }
}

fn issue_from(e: &io::Error, os: Os, path: &Path, what: &str) -> Issue {
    let ex = explain(e.kind(), e.raw_os_error(), os, Some(path));
    let kind = match e.kind() {
        io::ErrorKind::PermissionDenied => IssueKind::Permission,
        io::ErrorKind::NotADirectory => IssueKind::NotAFolder,
        _ => IssueKind::Other,
    };
    Issue {
        kind,
        message: format!("{what} {}", ex.message),
        hint: ex.hint,
    }
}

fn count_projects(dir: &Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.file_type().is_ok_and(|t| t.is_dir())
                        && valid_project_id(&e.file_name().to_string_lossy())
                })
                .count()
        })
        .unwrap_or(0)
}

/// Judged from the path's text alone, so a Windows path is recognised wherever this runs.
fn warnings_for(path: &Path, os: Os) -> Vec<Warning> {
    let text = path.to_string_lossy().to_lowercase();
    let parts: Vec<&str> = text.split(['\\', '/']).filter(|p| !p.is_empty()).collect();
    let mut out = Vec::new();
    let mut warn = |kind, message: &str| {
        out.push(Warning {
            kind,
            message: message.to_owned(),
        })
    };

    const SYNCED: [&str; 7] = [
        "onedrive",
        "dropbox",
        "icloud",
        "google drive",
        "googledrive",
        "mobile documents",
        "pcloud",
    ];
    if parts
        .iter()
        .any(|p| SYNCED.iter().any(|s| p.starts_with(s)))
    {
        warn(
            WarningKind::CloudSynced,
            "This folder is synced by a cloud service. Syncing can hold files for a moment while \
             you save and compile, and the temporary files LaTeX makes get synced too. A folder \
             outside it avoids both.",
        );
    }
    if text.starts_with(r"\\") && !text.starts_with(r"\\?\") {
        warn(
            WarningKind::NetworkShare,
            "This is a network folder. It can be slow, and it drops out when the connection does. \
             A folder on this computer is more reliable.",
        );
    }
    let in_install_folder = match os {
        Os::Windows => parts
            .iter()
            .any(|p| matches!(*p, "program files" | "program files (x86)" | "windowsapps")),
        Os::Mac => text.starts_with("/applications/"),
        Os::Other => false,
    };
    if in_install_folder {
        warn(
            WarningKind::InstallFolder,
            "This is where programs are installed. Updating or removing a program can take your \
             projects with it. Choose a folder of your own.",
        );
    }
    out
}

/// Looks at a folder without changing anything that matters: it may write and remove one small
/// probe file to prove the folder (or, for a folder that doesn't exist yet, the nearest one that
/// does) can be written to. `os` is a parameter so every platform's wording is testable anywhere.
pub fn check_folder(path: &Path, os: Os) -> FolderCheck {
    let mut check = FolderCheck {
        path: dunce::simplified(path).display().to_string(),
        exists: false,
        is_dir: false,
        writable: false,
        creatable: false,
        project_count: 0,
        issue: None,
        warnings: warnings_for(path, os),
        alternatives: Vec::new(),
    };
    if !path.is_absolute() {
        check.issue = Some(Issue {
            kind: IssueKind::NotAbsolute,
            message: "Enter the full path of a folder.".to_owned(),
            hint: Some(format!("For example {}", example_path(os))),
        });
        return check;
    }
    let not_a_folder = |what: String| Issue {
        kind: IssueKind::NotAFolder,
        message: what,
        hint: Some("Choose a folder.".to_owned()),
    };
    match fs::metadata(path) {
        Ok(m) if m.is_dir() => {
            check.exists = true;
            check.is_dir = true;
            check.project_count = count_projects(path);
            match probe_writable(path) {
                Ok(()) => check.writable = true,
                Err(e) => {
                    check.issue = Some(issue_from(
                        &e,
                        os,
                        path,
                        "SomeScript can't save files in this folder.",
                    ));
                }
            }
        }
        Ok(_) => {
            check.exists = true;
            check.issue = Some(not_a_folder(
                "That path is a file, not a folder.".to_owned(),
            ));
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // Not there yet. It can be made if the nearest folder that exists can be written to.
            let mut found = false;
            for ancestor in path.ancestors().skip(1) {
                match fs::metadata(ancestor) {
                    Ok(m) if m.is_dir() => {
                        found = true;
                        match probe_writable(ancestor) {
                            Ok(()) => check.creatable = true,
                            Err(e) => {
                                check.issue = Some(issue_from(
                                    &e,
                                    os,
                                    path,
                                    &format!(
                                        "SomeScript can't create this folder: it isn't allowed to write in {}.",
                                        dunce::simplified(ancestor).display()
                                    ),
                                ));
                            }
                        }
                        break;
                    }
                    Ok(_) => {
                        found = true;
                        check.issue = Some(not_a_folder(format!(
                            "A file is in the way: {}",
                            dunce::simplified(ancestor).display()
                        )));
                        break;
                    }
                    Err(_) => {}
                }
            }
            if !found {
                check.issue = Some(Issue {
                    kind: IssueKind::Unavailable,
                    message: "That drive or location isn't available.".to_owned(),
                    hint: Some("Connect it, or choose a folder on a drive that is.".to_owned()),
                });
            }
        }
        Err(e) => {
            check.issue = Some(issue_from(
                &e,
                os,
                path,
                "SomeScript can't open this folder.",
            ));
        }
    }
    check
}

/// [`check_folder`], plus (only when the folder has a problem) the `candidates` that would work.
pub fn check_with_alternatives(path: &Path, candidates: &[PathBuf], os: Os) -> FolderCheck {
    let mut check = check_folder(path, os);
    if check.issue.is_some() {
        check.alternatives = candidates
            .iter()
            .filter(|c| c.as_path() != path)
            .filter(|c| {
                let r = check_folder(c, os);
                r.issue.is_none() && (r.writable || r.creatable)
            })
            .map(|c| dunce::simplified(c).display().to_string())
            .collect();
    }
    check
}

/// A project's id is its folder's name.
fn folder_id(dir: &Path) -> String {
    dir.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
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

    #[test]
    fn create_makes_a_missing_library_folder() {
        // The reported Windows bug: the default folder could not be made at startup (a security
        // feature blocked it), so creating a project failed with a bare "File not found".
        // The folder is made when it is needed, and the real reason is reported if that fails.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Documents").join("SomeScript");
        let l = Library::with_source(root.clone(), RootSource::Default);
        assert_eq!(l.create("Paper").unwrap(), "Paper");
        assert!(root.join("Paper").is_dir());
        assert_eq!(l.create("Paper").unwrap(), "Paper 2");
    }

    #[test]
    fn a_library_that_cannot_be_made_says_which_folder_and_why() {
        let dir = tempfile::tempdir().unwrap();
        let blocker = dir.path().join("blocker");
        fs::write(&blocker, "a file, not a folder").unwrap();
        let l = Library::with_source(blocker.join("SomeScript"), RootSource::Default);
        let e = l.create("Paper").unwrap_err();
        assert!(
            e.message.contains("Couldn't create the library folder"),
            "{}",
            e.message
        );
        assert!(e.message.contains("blocker"), "{}", e.message);
        assert!(!e.message.contains("File not found"), "{}", e.message);
        assert!(e.hint.is_some(), "the user is told what to try");
    }

    #[test]
    fn a_folder_the_user_chose_is_never_silently_recreated_empty() {
        let dir = tempfile::tempdir().unwrap();
        let moved = dir.path().join("Moved");
        let l = Library::with_source(moved.clone(), RootSource::Saved);
        let e = l.create("Paper").unwrap_err();
        assert!(e.message.contains("Moved"), "{}", e.message);
        assert!(
            !moved.exists(),
            "a chosen folder that vanished is reported, not recreated behind the user's back"
        );
        // A chosen folder that is really a file is reported too.
        let file = dir.path().join("a-file");
        fs::write(&file, "x").unwrap();
        let l = Library::with_source(file, RootSource::Saved);
        assert!(l.ensure_root().unwrap_err().message.contains("a-file"));

        // The app's own default folder and explicit overrides are made on demand.
        for source in [RootSource::Default, RootSource::Fallback, RootSource::Env] {
            let root = dir.path().join(format!("{source:?}"));
            let l = Library::with_source(root.clone(), source);
            assert_eq!(l.create("P").unwrap(), "P");
            assert!(root.join("P").is_dir());
        }
    }

    #[test]
    fn the_library_location_follows_env_then_saved_then_documents() {
        let base = tempfile::tempdir().unwrap();
        let p = |n: &str| Some(base.path().join(n));
        let r = resolve_root(p("env"), p("saved"), p("docs"), p("home"), p("data"));
        assert_eq!(
            (r.root, r.source),
            (base.path().join("env"), RootSource::Env)
        );
        assert_eq!(r.default, base.path().join("docs").join("SomeScript"));
        let r = resolve_root(None, p("saved"), p("docs"), p("home"), p("data"));
        assert_eq!(
            (r.root, r.source),
            (base.path().join("saved"), RootSource::Saved)
        );
        let r = resolve_root(None, None, p("docs"), p("home"), p("data"));
        assert_eq!(
            (r.root, r.source),
            (
                base.path().join("docs").join("SomeScript"),
                RootSource::Default
            )
        );
    }

    #[test]
    fn without_a_documents_folder_the_default_is_still_an_absolute_path() {
        let base = tempfile::tempdir().unwrap();
        let p = |n: &str| Some(base.path().join(n));
        let r = resolve_root(None, None, None, p("home"), p("data"));
        assert_eq!(r.root, base.path().join("home").join("SomeScript"));
        assert_eq!((r.source, &r.default), (RootSource::Fallback, &r.root));
        let r = resolve_root(None, None, None, None, p("data"));
        assert_eq!(r.root, base.path().join("data").join("Projects"));
        // Nothing known at all: the old code fell back to the relative path "SomeScript", i.e.
        // wherever the working directory happened to be.
        let r = resolve_root(None, None, None, None, None);
        assert!(r.root.is_absolute(), "{:?}", r.root);
        // A relative override is anchored too.
        let r = resolve_root(Some("rel/dir".into()), None, p("docs"), None, None);
        assert!(r.root.is_absolute(), "{:?}", r.root);
        assert_eq!(r.source, RootSource::Env);
    }

    fn check(path: &Path) -> FolderCheck {
        check_folder(path, Os::CURRENT)
    }

    #[test]
    fn a_usable_folder_is_writable_and_counts_its_projects() {
        let (d, l) = lib();
        l.create("One").unwrap();
        l.create("Two").unwrap();
        fs::create_dir(d.path().join(".trash")).unwrap();
        fs::write(d.path().join("notes.txt"), "x").unwrap();
        let c = check(d.path());
        assert!(c.exists && c.is_dir && c.writable && !c.creatable, "{c:?}");
        assert_eq!(c.issue, None);
        assert_eq!(
            c.project_count, 2,
            "hidden folders and loose files are not projects"
        );
        assert!(
            fs::read_dir(d.path())
                .unwrap()
                .flatten()
                .all(|e| !e.file_name().to_string_lossy().contains("write-test")),
            "the probe file is removed again"
        );
    }

    #[test]
    fn a_missing_folder_is_creatable_when_its_nearest_parent_is_writable() {
        let d = tempfile::tempdir().unwrap();
        let target = d.path().join("Documents").join("SomeScript");
        let c = check(&target);
        assert!(!c.exists && c.creatable && c.issue.is_none(), "{c:?}");
        assert!(
            !d.path().join("Documents").exists(),
            "checking a folder must not create it"
        );
    }

    #[test]
    fn a_file_or_a_relative_path_is_not_a_usable_folder() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("f");
        fs::write(&file, "x").unwrap();
        assert_eq!(check(&file).issue.unwrap().kind, IssueKind::NotAFolder);
        assert_eq!(
            check(&file.join("sub")).issue.unwrap().kind,
            IssueKind::NotAFolder,
            "a path that runs through a file"
        );
        let rel = check(Path::new("relative/dir")).issue.unwrap();
        assert_eq!(rel.kind, IssueKind::NotAbsolute);
        assert!(rel.hint.unwrap().contains("For example"));
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_the_user_cannot_write_to_is_an_issue_with_a_way_out() {
        use std::os::unix::fs::PermissionsExt;
        let d = tempfile::tempdir().unwrap();
        let ro = d.path().join("ro");
        fs::create_dir(&ro).unwrap();
        fs::set_permissions(&ro, fs::Permissions::from_mode(0o555)).unwrap();
        if fs::write(ro.join("probe"), "").is_ok() {
            return; // root ignores permission bits: nothing to observe
        }
        let c = check(&ro);
        let issue = c.issue.expect("a read-only folder is an issue");
        assert_eq!(issue.kind, IssueKind::Permission);
        assert!(!c.writable && issue.hint.is_some());
        let c = check(&ro.join("sub"));
        assert!(
            !c.creatable && c.issue.is_some(),
            "can't be made inside it either"
        );
        fs::set_permissions(&ro, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    fn warnings_come_from_the_path_alone_so_windows_paths_are_recognised_anywhere() {
        let kinds = |p: &str, os| {
            warnings_for(Path::new(p), os)
                .into_iter()
                .map(|w| w.kind)
                .collect::<Vec<_>>()
        };
        use WarningKind::*;
        assert_eq!(
            kinds(r"C:\Users\Ann\OneDrive\Documents\SomeScript", Os::Windows),
            [CloudSynced]
        );
        assert_eq!(kinds(r"\\nas\share\tex", Os::Windows), [NetworkShare]);
        assert_eq!(
            kinds(r"C:\Program Files\SomeScript\projects", Os::Windows),
            [InstallFolder]
        );
        assert!(kinds(r"C:\Users\Ann\SomeScript", Os::Windows).is_empty());
        // Documents itself is not a warning: the folder check proves writability by writing, and a
        // refusal comes back as an issue with the specific advice (Controlled folder access, macOS
        // privacy), so the happy path isn't covered in warnings that mostly don't apply.
        assert!(kinds("/Users/ann/Documents/SomeScript", Os::Mac).is_empty());
        assert!(kinds(r"C:\Users\Ann\Documents\SomeScript", Os::Windows).is_empty());
        assert_eq!(
            kinds(
                "/Users/ann/Library/Mobile Documents/com~apple~CloudDocs/tex",
                Os::Mac
            ),
            [CloudSynced]
        );
        assert_eq!(
            kinds("/Applications/SomeScript.app/x", Os::Mac),
            [InstallFolder]
        );
        assert_eq!(kinds("/home/ann/Dropbox/tex", Os::Other), [CloudSynced]);
        assert!(kinds("/home/ann/SomeScript", Os::Other).is_empty());
    }

    #[test]
    fn alternatives_are_offered_only_when_there_is_a_problem_and_only_if_they_work() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("f");
        fs::write(&file, "x").unwrap();
        let good = d.path().join("Good");
        let under_a_file = file.join("Bad");
        let c = check_with_alternatives(
            &file,
            &[good.clone(), under_a_file, file.clone()],
            Os::CURRENT,
        );
        assert!(c.issue.is_some());
        assert_eq!(
            c.alternatives,
            vec![dunce::simplified(&good).display().to_string()]
        );
        let c = check_with_alternatives(d.path(), &[good], Os::CURRENT);
        assert!(c.issue.is_none() && c.alternatives.is_empty());
    }
}
