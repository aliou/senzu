//! Per-terminal answer cache, so tools never have to query.

use std::env;
use std::ffi::{CStr, CString};
use std::fs;
use std::io::Write;
use std::mem::MaybeUninit;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::appearance::Appearance;

/// `$SENZU_APPEARANCE_CACHE`, else `$XDG_RUNTIME_DIR/senzu`, else
/// `/tmp/senzu-<uid>`, with the terminal key appended.
pub fn path() -> Option<PathBuf> {
    if let Some(explicit) = env::var_os("SENZU_APPEARANCE_CACHE") {
        if !explicit.is_empty() {
            return Some(PathBuf::from(explicit));
        }
    }

    let dir = match env::var_os("XDG_RUNTIME_DIR") {
        Some(runtime) if !runtime.is_empty() => PathBuf::from(runtime).join("senzu"),
        _ => PathBuf::from(format!("/tmp/senzu-{}", unsafe { libc::getuid() })),
    };
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("appearance-{}", tty_key())))
}

/// Lock file for the probe, next to the cache entry and keyed the same way.
///
/// The lock cannot be `/dev/tty` itself: that is a single device node shared
/// by every process on the machine, so locking it would serialize probes in
/// unrelated terminals.
pub fn lock_path() -> Option<PathBuf> {
    let mut path = path()?.into_os_string();
    path.push(".lock");
    Some(PathBuf::from(path))
}

/// `max_age: None` accepts any age, `Some(ZERO)` never reuses.
pub fn read(path: &Path, max_age: Option<Duration>) -> Option<Appearance> {
    if max_age == Some(Duration::ZERO) {
        return None;
    }

    let metadata = fs::metadata(path).ok()?;
    if let Some(max_age) = max_age {
        let age = SystemTime::now()
            .duration_since(metadata.modified().ok()?)
            .unwrap_or(Duration::ZERO);
        if age > max_age {
            return None;
        }
    }
    fs::read_to_string(path).ok()?.trim().parse().ok()
}

pub fn write(path: &Path, value: Appearance) {
    let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
    let written = fs::File::create(&tmp).and_then(|mut file| writeln!(file, "{}", value.as_str()));
    if written.is_ok() && fs::rename(&tmp, path).is_ok() {
        return;
    }
    let _ = fs::remove_file(&tmp);
}

/// Identifies the terminal, not the process: two terminals must never share a
/// cache entry. Prefers `ttyname` (`/dev/ttys004` -> `dev-ttys004`) and falls
/// back to the device id when stdio is redirected, because `ttyname` then
/// resolves to plain `/dev/tty`, which is the same string in every terminal.
fn tty_key() -> String {
    for fd in [libc::STDIN_FILENO, libc::STDERR_FILENO, libc::STDOUT_FILENO] {
        if let Some(name) = specific_ttyname(fd) {
            return sanitize(&name);
        }
    }

    let Ok(path) = CString::new("/dev/tty".as_bytes()) else {
        return "notty".to_string();
    };
    let fd = unsafe { libc::open(path.as_ptr(), libc::O_RDONLY | libc::O_NOCTTY) };
    if fd < 0 {
        return "notty".to_string();
    }

    let name = specific_ttyname(fd);
    let mut status = MaybeUninit::<libc::stat>::uninit();
    let device = (unsafe { libc::fstat(fd, status.as_mut_ptr()) } == 0)
        .then(|| unsafe { status.assume_init() }.st_rdev);
    unsafe { libc::close(fd) };

    match (name, device) {
        (Some(name), _) => sanitize(&name),
        (None, Some(rdev)) => format!("rdev-{rdev}"),
        (None, None) => "notty".to_string(),
    }
}

/// `ttyname` for a specific descriptor, ignoring the generic `/dev/tty`.
fn specific_ttyname(fd: libc::c_int) -> Option<String> {
    let ptr = unsafe { libc::ttyname(fd) };
    if ptr.is_null() {
        return None;
    }
    let name = unsafe { CStr::from_ptr(ptr) }
        .to_string_lossy()
        .into_owned();
    (name != "/dev/tty").then_some(name)
}

fn sanitize(name: &str) -> String {
    name.trim_start_matches('/').replace('/', "-")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("senzu-test-{}-{}", name, std::process::id()))
    }

    #[test]
    fn missing_cache_is_a_miss() {
        let path = temp_path("missing");
        let _ = fs::remove_file(&path);
        assert_eq!(read(&path, None), None);
    }

    #[test]
    fn round_trips_a_value() {
        let path = temp_path("roundtrip");
        write(&path, Appearance::Light);
        assert_eq!(read(&path, None), Some(Appearance::Light));

        write(&path, Appearance::Dark);
        assert_eq!(read(&path, None), Some(Appearance::Dark));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn honors_max_age() {
        let path = temp_path("max-age");
        write(&path, Appearance::Dark);

        assert_eq!(
            read(&path, Some(Duration::from_secs(60))),
            Some(Appearance::Dark),
            "fresh enough"
        );
        assert_eq!(read(&path, Some(Duration::ZERO)), None, "zero never reuses");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rejects_garbage_contents() {
        let path = temp_path("garbage");
        fs::write(&path, "chartreuse\n").unwrap();
        assert_eq!(read(&path, None), None);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn leaves_no_temporary_file_behind() {
        let path = temp_path("tmpfile");
        write(&path, Appearance::Dark);
        let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
        assert!(!tmp.exists());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn tty_key_is_a_single_path_component() {
        let key = tty_key();
        assert!(!key.is_empty());
        assert!(!key.contains('/'), "got {key}");
    }

    #[test]
    fn sanitizes_device_paths() {
        assert_eq!(sanitize("/dev/ttys004"), "dev-ttys004");
        assert_eq!(sanitize("/dev/pts/3"), "dev-pts-3");
    }

    #[test]
    fn lock_sits_next_to_the_cache_entry() {
        // SAFETY: single-threaded assertion on process environment; the value
        // is restored before returning.
        let previous = env::var_os("SENZU_APPEARANCE_CACHE");
        unsafe { env::set_var("SENZU_APPEARANCE_CACHE", "/tmp/senzu-lock-test") };

        assert_eq!(path(), Some(PathBuf::from("/tmp/senzu-lock-test")));
        assert_eq!(
            lock_path(),
            Some(PathBuf::from("/tmp/senzu-lock-test.lock")),
            "the lock must never be /dev/tty: it is shared by every terminal"
        );

        match previous {
            Some(value) => unsafe { env::set_var("SENZU_APPEARANCE_CACHE", value) },
            None => unsafe { env::remove_var("SENZU_APPEARANCE_CACHE") },
        }
    }
}
