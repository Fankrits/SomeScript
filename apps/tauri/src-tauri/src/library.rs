//! The library is a plain folder; every subfolder is a project and its name is the
//! project id. No database or index to drift out of sync with what's on disk, and users
//! can manage projects in Finder/Explorer.

use crate::{
    error::{ApiError, ApiResult},
    storage::Project,
};
use std::{
    path::{Component, Path, PathBuf},
    sync::RwLock,
};

pub struct Library {
    root: RwLock<PathBuf>,
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
