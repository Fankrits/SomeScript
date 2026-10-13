//! Tiny persisted app config (`config.json` in the OS app-config dir). Today it only
//! remembers where the user keeps their projects.

use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub library_path: Option<PathBuf>,
}

/// A missing or corrupt file means "no saved choice", never a startup failure.
pub fn load(path: &Path) -> Config {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, config: &Config) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(config)?)?;
    fs::rename(tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_tolerates_a_missing_or_corrupt_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/config.json");
        assert_eq!(load(&path), Config::default());
        let cfg = Config {
            library_path: Some("/tmp/Projects".into()),
        };
        save(&path, &cfg).unwrap();
        assert_eq!(load(&path), cfg);
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Config::default());
    }
}
