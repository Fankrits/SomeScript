//! Tiny persisted app config (`config.json` in the OS app-config dir): where the user keeps their
//! projects, and whether first-run setup has been done.

use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Every field has a default, so a file written by an older version (or edited by hand) still loads.
#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    /// The folder the user chose in Settings or setup. `None` means "the default".
    pub library_path: Option<PathBuf>,
    /// First-run setup was completed or skipped. Not set by versions before 0.1.2.
    pub onboarded: bool,
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

/// Loads the saved config, applies `change`, and saves it, so a caller that sets one field never
/// wipes another one.
pub fn update(path: &Path, change: impl FnOnce(&mut Config)) -> io::Result<Config> {
    let mut config = load(path);
    change(&mut config);
    save(path, &config)?;
    Ok(config)
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
            onboarded: true,
        };
        save(&path, &cfg).unwrap();
        assert_eq!(load(&path), cfg);
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Config::default());
    }

    #[test]
    fn a_config_from_an_older_version_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        // 0.1.0/0.1.1 wrote only the library path.
        fs::write(&path, r#"{ "libraryPath": "/tmp/Old" }"#).unwrap();
        assert_eq!(
            load(&path),
            Config {
                library_path: Some("/tmp/Old".into()),
                onboarded: false
            }
        );
    }

    #[test]
    fn update_changes_one_field_and_keeps_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        update(&path, |c| c.library_path = Some("/tmp/A".into())).unwrap();
        let after = update(&path, |c| c.onboarded = true).unwrap();
        assert_eq!(after.library_path.as_deref(), Some(Path::new("/tmp/A")));
        assert!(after.onboarded);
        assert_eq!(load(&path), after);
    }
}
