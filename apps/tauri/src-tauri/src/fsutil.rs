//! File operations that Windows refuses for a moment.
//!
//! Replacing, renaming or deleting a file fails on Windows while another program has it open, and
//! the programs that do that are the ones on every machine: antivirus scanning a file that was just
//! written, OneDrive or Dropbox syncing it, the search indexer, Explorer's preview pane. The error
//! (access denied, sharing violation, lock violation) clears within moments, so the right answer to
//! an autosave or a rename that hits one is to try again, not to report a failure. rustc and cargo
//! do the same for the same reason.

use std::{io, thread, time::Duration};

/// Waits between tries: 25, 50, 100, 200, 400 and 800 ms, about 1.6 s before giving up.
const DELAYS: [Duration; 6] = [
    Duration::from_millis(25),
    Duration::from_millis(50),
    Duration::from_millis(100),
    Duration::from_millis(200),
    Duration::from_millis(400),
    Duration::from_millis(800),
];

/// Windows only: ERROR_ACCESS_DENIED (5), ERROR_SHARING_VIOLATION (32), ERROR_LOCK_VIOLATION (33).
/// Elsewhere these numbers mean something else and nothing is retried.
pub fn is_busy(e: &io::Error) -> bool {
    cfg!(windows) && matches!(e.raw_os_error(), Some(5 | 32 | 33))
}

/// Runs `op`, trying again after a short wait while it fails with [`is_busy`]. The last error is
/// returned unchanged if it never clears.
pub fn retry_busy<T>(op: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    retry_while(is_busy, &DELAYS, op)
}

/// [`retry_busy`] with the test and the waits spelled out (so the loop can be tested anywhere).
fn retry_while<T>(
    busy: impl Fn(&io::Error) -> bool,
    delays: &[Duration],
    mut op: impl FnMut() -> io::Result<T>,
) -> io::Result<T> {
    let mut waits = delays.iter();
    loop {
        match op() {
            Err(e) if busy(&e) => match waits.next() {
                Some(wait) => thread::sleep(*wait),
                None => return Err(e),
            },
            other => return other,
        }
    }
}

/// `tmp.persist(dest)` (the atomic replace behind every save), retried while the destination is
/// briefly locked. A failed persist hands the temp file back, so it can simply be tried again.
pub fn persist_with_retry(tmp: tempfile::NamedTempFile, dest: &std::path::Path) -> io::Result<()> {
    let mut tmp = Some(tmp);
    retry_busy(|| {
        let file = tmp.take().expect("a failed persist returns the file");
        match file.persist(dest) {
            Ok(_) => Ok(()),
            Err(e) => {
                tmp = Some(e.file);
                Err(e.error)
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    const NO_WAIT: [Duration; 3] = [Duration::ZERO; 3];
    fn busy(e: &io::Error) -> bool {
        e.kind() == io::ErrorKind::ResourceBusy
    }
    fn locked() -> io::Error {
        io::Error::from(io::ErrorKind::ResourceBusy)
    }

    #[test]
    fn a_lock_that_clears_is_waited_out() {
        let tries = Cell::new(0);
        let result = retry_while(busy, &NO_WAIT, || {
            tries.set(tries.get() + 1);
            if tries.get() < 3 {
                Err(locked())
            } else {
                Ok("saved")
            }
        });
        assert_eq!(result.unwrap(), "saved");
        assert_eq!(tries.get(), 3);
    }

    #[test]
    fn a_lock_that_never_clears_is_reported_after_the_last_wait() {
        let tries = Cell::new(0);
        let result: io::Result<()> = retry_while(busy, &NO_WAIT, || {
            tries.set(tries.get() + 1);
            Err(locked())
        });
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::ResourceBusy);
        assert_eq!(
            tries.get(),
            NO_WAIT.len() + 1,
            "the first try plus one per wait"
        );
    }

    #[test]
    fn other_errors_and_successes_are_not_retried() {
        let tries = Cell::new(0);
        let result: io::Result<()> = retry_while(busy, &NO_WAIT, || {
            tries.set(tries.get() + 1);
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        });
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(tries.get(), 1);
    }

    #[test]
    fn only_windows_treats_these_codes_as_a_momentary_lock() {
        let denied = io::Error::from_raw_os_error(5);
        assert_eq!(is_busy(&denied), cfg!(windows));
        assert!(!is_busy(&io::Error::from(io::ErrorKind::NotFound)));
    }

    #[test]
    fn persist_replaces_the_destination() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("a.tex");
        std::fs::write(&dest, "old").unwrap();
        let mut tmp = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
        io::Write::write_all(&mut tmp, b"new").unwrap();
        persist_with_retry(tmp, &dest).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "new");
    }
}
