//! The terminal query. This is the only module allowed to touch the tty; see
//! docs/appearance-detection.md.

use std::ffi::CString;
use std::mem::MaybeUninit;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::time::{Duration, Instant};

use crate::appearance::Appearance;
use crate::osc;

const LOCK_WAIT: Duration = Duration::from_millis(60);
const LOCK_RETRY: Duration = Duration::from_millis(5);
const READ_BUF: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbeStatus {
    Answered(Appearance),
    /// No terminal, no answer, or typeahead waiting: fall back to the cache.
    Unavailable,
    /// Another probe holds the lock; its answer will land in the cache.
    Busy,
}

/// Opens `/dev/tty`, takes the terminal's lock, disables echo, asks for the
/// background, and restores the terminal on every exit path.
///
/// `lock` serializes probes that share a terminal. It must be a per-terminal
/// file: `/dev/tty` is one device node shared by every process, so locking it
/// would make unrelated terminals wait on each other. Without a lock the probe
/// still runs, it just loses that protection.
pub fn probe(timeout: Duration, lock: Option<&Path>) -> ProbeStatus {
    let Ok(tty_path) = CString::new("/dev/tty".as_bytes()) else {
        return ProbeStatus::Unavailable;
    };
    let fd = unsafe { libc::open(tty_path.as_ptr(), libc::O_RDWR | libc::O_NOCTTY) };
    if fd < 0 {
        return ProbeStatus::Unavailable;
    }

    install_signal_handlers();

    let guard = lock.and_then(TerminalLock::acquire);
    if matches!(guard, Some(TerminalLock { locked: false, .. })) {
        unsafe { libc::close(fd) };
        return ProbeStatus::Busy;
    }

    let status = match query_background(fd, timeout) {
        Some(appearance) => ProbeStatus::Answered(appearance),
        None => ProbeStatus::Unavailable,
    };

    drop(guard);
    TTY_FD.store(-1, Ordering::SeqCst);
    unsafe { libc::close(fd) };
    status
}

/// An advisory lock on a per-terminal file, released on drop.
struct TerminalLock {
    fd: libc::c_int,
    locked: bool,
}

impl TerminalLock {
    fn acquire(path: &Path) -> Option<Self> {
        let raw = CString::new(path.as_os_str().as_bytes()).ok()?;
        let fd = unsafe {
            libc::open(
                raw.as_ptr(),
                libc::O_RDWR | libc::O_CREAT | libc::O_CLOEXEC,
                0o600,
            )
        };
        if fd < 0 {
            return None;
        }

        let deadline = Instant::now() + LOCK_WAIT;
        loop {
            if unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) } == 0 {
                return Some(TerminalLock { fd, locked: true });
            }
            if Instant::now() >= deadline {
                // Another probe is mid-flight; its answer lands in the cache.
                return Some(TerminalLock { fd, locked: false });
            }
            std::thread::sleep(LOCK_RETRY);
        }
    }
}

impl Drop for TerminalLock {
    fn drop(&mut self) {
        if self.locked {
            unsafe { libc::flock(self.fd, libc::LOCK_UN) };
        }
        unsafe { libc::close(self.fd) };
    }
}

/// Everything between disabling echo and restoring it.
fn query_background(fd: i32, timeout: Duration) -> Option<Appearance> {
    // Typeahead already waiting: a probe would read the user's keystrokes and
    // drop them. Skip and let the caller fall back to the cache.
    let mut pending: libc::c_int = 0;
    if unsafe { libc::ioctl(fd, libc::FIONREAD, &mut pending) } == 0 && pending > 0 {
        return None;
    }

    let query = osc::build_query(std::env::var_os("TMUX").is_some());
    let vtime = timeout.as_millis().div_ceil(100).clamp(1, 255) as u8;
    let _quiet = QuietMode::enter(fd, vtime)?;

    write_all(fd, &query)?;

    let deadline = Instant::now() + timeout;
    let mut buf = [0u8; READ_BUF];
    let mut used = 0;
    while Instant::now() < deadline && used < buf.len() {
        let got = unsafe {
            libc::read(
                fd,
                buf[used..].as_mut_ptr() as *mut libc::c_void,
                buf.len() - used,
            )
        };
        if got < 0 {
            if last_error_is_interrupt() {
                continue;
            }
            break;
        }
        if got == 0 {
            continue; // VTIME expired; the deadline decides when to stop
        }
        used += got as usize;
        if osc::reply_complete(&buf[..used]) {
            break;
        }
    }

    osc::parse_background(&buf[..used]).map(osc::appearance_from_rgb)
}

fn write_all(fd: i32, buf: &[u8]) -> Option<()> {
    let mut offset = 0;
    while offset < buf.len() {
        let written = unsafe {
            libc::write(
                fd,
                buf[offset..].as_ptr() as *const libc::c_void,
                buf.len() - offset,
            )
        };
        if written < 0 {
            if last_error_is_interrupt() {
                continue;
            }
            return None;
        }
        offset += written as usize;
    }
    Some(())
}

fn last_error_is_interrupt() -> bool {
    std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted
}

// ---------------------------------------------------------------------------
// Terminal state
// ---------------------------------------------------------------------------

static TTY_FD: AtomicI32 = AtomicI32::new(-1);
static TERMIOS_DIRTY: AtomicBool = AtomicBool::new(false);

/// The saved terminal state has to be reachable from a signal handler, so it
/// cannot live behind a lock (locking is not async-signal-safe). Access is
/// serialized by `TERMIOS_DIRTY`: the probe writes it before setting the flag
/// that lets the handler read it.
struct SavedTermios(std::cell::UnsafeCell<MaybeUninit<libc::termios>>);
unsafe impl Sync for SavedTermios {}

static SAVED_TERMIOS: SavedTermios =
    SavedTermios(std::cell::UnsafeCell::new(MaybeUninit::uninit()));

/// Async-signal-safe: `tcsetattr` is on the POSIX AS-safe list.
fn restore_termios() {
    if TERMIOS_DIRTY.swap(false, Ordering::SeqCst) {
        let fd = TTY_FD.load(Ordering::SeqCst);
        if fd >= 0 {
            // TCSANOW, not TCSAFLUSH: flushing would discard the user's typeahead.
            unsafe { libc::tcsetattr(fd, libc::TCSANOW, (*SAVED_TERMIOS.0.get()).as_ptr()) };
        }
    }
}

extern "C" fn on_signal(sig: libc::c_int) {
    restore_termios();
    unsafe {
        libc::signal(sig, libc::SIG_DFL);
        libc::raise(sig);
    }
}

fn install_signal_handlers() {
    let mut action: libc::sigaction = unsafe { std::mem::zeroed() };
    action.sa_sigaction = on_signal as *const () as libc::sighandler_t;
    unsafe { libc::sigemptyset(&mut action.sa_mask) };
    for sig in [
        libc::SIGINT,
        libc::SIGTERM,
        libc::SIGHUP,
        libc::SIGQUIT,
        libc::SIGPIPE,
    ] {
        unsafe { libc::sigaction(sig, &action, std::ptr::null_mut()) };
    }
}

/// Restores the terminal when the probe returns or unwinds.
struct QuietMode;

impl QuietMode {
    /// `VMIN=0` with `VTIME>0` gives a read that blocks until data arrives or
    /// the inter-byte timer expires. Do not use `VMIN=0`/`VTIME=0` with
    /// `poll()`: on macOS a never-blocking read makes `poll()` report `POLLIN`
    /// unconditionally, turning the wait into a busy spin that misses the reply.
    fn enter(fd: i32, vtime_deciseconds: u8) -> Option<Self> {
        let mut current = MaybeUninit::<libc::termios>::uninit();
        if unsafe { libc::tcgetattr(fd, current.as_mut_ptr()) } != 0 {
            return None;
        }

        let saved = unsafe { current.assume_init() };
        let mut raw = saved;
        raw.c_lflag &= !(libc::ECHO | libc::ICANON);
        raw.c_cc[libc::VMIN] = 0;
        raw.c_cc[libc::VTIME] = vtime_deciseconds.max(1);

        unsafe { (*SAVED_TERMIOS.0.get()).write(saved) };
        TTY_FD.store(fd, Ordering::SeqCst);
        // Mark dirty before the change, not after: a signal arriving between
        // the two would otherwise skip restoration. Restoring a terminal that
        // was never modified is a no-op.
        TERMIOS_DIRTY.store(true, Ordering::SeqCst);
        if unsafe { libc::tcsetattr(fd, libc::TCSANOW, &raw) } != 0 {
            TERMIOS_DIRTY.store(false, Ordering::SeqCst);
            return None;
        }
        Some(QuietMode)
    }
}

impl Drop for QuietMode {
    fn drop(&mut self) {
        restore_termios();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_a_status_without_a_terminal() {
        // `cargo test` runs without a controlling terminal in CI and with one
        // locally, so accept any status but never a panic or a hang.
        let status = probe(Duration::from_millis(20), None);
        assert!(matches!(
            status,
            ProbeStatus::Answered(_) | ProbeStatus::Unavailable | ProbeStatus::Busy
        ));
    }

    #[test]
    fn reports_busy_when_the_terminal_lock_is_held() {
        let path = std::env::temp_dir().join(format!("senzu-lock-{}", std::process::id()));
        let held = TerminalLock::acquire(&path).expect("first acquire");
        assert!(held.locked);

        let second = TerminalLock::acquire(&path).expect("second acquire");
        assert!(!second.locked, "a held lock must report busy, not block");

        drop(second);
        drop(held);

        let third = TerminalLock::acquire(&path).expect("after release");
        assert!(third.locked, "the lock must be released on drop");
        drop(third);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn restoring_without_a_probe_is_a_noop() {
        TERMIOS_DIRTY.store(false, Ordering::SeqCst);
        restore_termios();
        assert!(!TERMIOS_DIRTY.load(Ordering::SeqCst));
    }
}
