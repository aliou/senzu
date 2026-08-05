//! Terminal-level tests against a real pty.
//!
//! These cover the guarantees that broke in the shell implementation this
//! binary replaces, and that no unit test can reach:
//!
//!   - the terminal's reply is never echoed back onto the screen
//!   - the terminal is left exactly as it was found
//!   - a probe is skipped when the user has typed ahead
//!
//! A fake terminal on the master side answers OSC 11, so no assumption is made
//! about the terminal `cargo test` happens to run under.

use std::ffi::CString;
use std::io::Read;
use std::os::unix::io::FromRawFd;
use std::time::{Duration, Instant};

const BIN: &str = env!("CARGO_BIN_EXE_senzu-appearance");
const QUERY: &[u8] = b"]11;?";

struct Session {
    /// Everything the child wrote to the terminal, plus anything the terminal
    /// echoed back at it.
    output: Vec<u8>,
    status: i32,
}

impl Session {
    fn saw_query(&self) -> bool {
        find(&self.output, QUERY).is_some()
    }

    /// Output after the query, with the query itself removed. Any `rgb:` left
    /// here was echoed by the terminal, which is the bug this binary exists to
    /// prevent.
    fn echoed_reply(&self) -> bool {
        let tail = match find(&self.output, QUERY) {
            Some(index) => &self.output[index + QUERY.len()..],
            None => &self.output[..],
        };
        find(tail, b"rgb:").is_some()
    }

    /// The last visible line: what the binary printed. Escape sequences are
    /// stripped because the query the child wrote lands in the same stream,
    /// and earlier lines can hold echoed typeahead.
    fn printed(&self) -> String {
        let mut visible = Vec::new();
        let mut bytes = self.output.iter().copied().peekable();
        while let Some(byte) = bytes.next() {
            if byte != 0x1b {
                visible.push(byte);
                continue;
            }
            // Skip to the end of the sequence: ST (ESC \) or BEL.
            while let Some(inner) = bytes.next() {
                if inner == 0x07 {
                    break;
                }
                if inner == 0x1b && bytes.peek() == Some(&b'\\') {
                    bytes.next();
                    break;
                }
            }
        }
        String::from_utf8_lossy(&visible)
            .replace("\r\n", "\n")
            .lines()
            .last()
            .unwrap_or_default()
            .trim()
            .to_string()
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Runs the binary on a pty. `reply` is written once the query is seen;
/// `typeahead` is written before the child starts.
fn run_on_pty(args: &[&str], reply: Option<&[u8]>, typeahead: Option<&[u8]>) -> Session {
    // Everything the child needs is built before the fork: after forkpty the
    // child may only call async-signal-safe functions, and `cargo test` is
    // multithreaded, so allocating there can deadlock.
    // With typeahead, the child must not start before the bytes are in the
    // terminal's input queue, or the test races the FIONREAD guard. A shell
    // that sleeps first makes the ordering deterministic.
    let (program, argv_owned) = if typeahead.is_some() {
        let command = format!("sleep 0.2; exec {BIN} {}", args.join(" "));
        (
            CString::new("/bin/sh").unwrap(),
            ["/bin/sh", "-c", &command]
                .map(|arg| CString::new(arg).unwrap())
                .to_vec(),
        )
    } else {
        let program = CString::new(BIN).unwrap();
        let mut argv_owned = vec![program.clone()];
        argv_owned.extend(args.iter().map(|arg| CString::new(*arg).unwrap()));
        (program, argv_owned)
    };
    let mut argv: Vec<*const libc::c_char> = argv_owned.iter().map(|arg| arg.as_ptr()).collect();
    argv.push(std::ptr::null());

    static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let cache = std::env::temp_dir().join(format!(
        "senzu-pty-test-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    ));
    let _ = std::fs::remove_file(&cache);
    let env_owned = [
        CString::new(format!("SENZU_APPEARANCE_CACHE={}", cache.display())).unwrap(),
        CString::new("TERM=xterm-256color").unwrap(),
    ];
    let mut envp: Vec<*const libc::c_char> = env_owned.iter().map(|entry| entry.as_ptr()).collect();
    envp.push(std::ptr::null());

    // Allocating a pty is not thread safe: concurrent forkpty calls hand two
    // children the same terminal, and they read each other's replies. Tests
    // still run in parallel, only the allocation is serialized.
    static PTY_ALLOCATION: std::sync::Mutex<()> = std::sync::Mutex::new(());

    let mut master: libc::c_int = -1;
    let pid = {
        let _guard = PTY_ALLOCATION
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let pid = unsafe {
            libc::forkpty(
                &mut master,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };

        if pid == 0 {
            unsafe {
                libc::execve(program.as_ptr(), argv.as_ptr(), envp.as_ptr());
                libc::_exit(127);
            }
        }
        pid
    };
    assert!(pid > 0, "forkpty failed");

    let mut file = unsafe { std::fs::File::from_raw_fd(master) };
    if let Some(bytes) = typeahead {
        write_master(master, bytes);
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut output = Vec::new();
    let mut answered = false;
    let mut buf = [0u8; 1024];

    // Read until the child exits and closes the slave side, which surfaces as
    // EOF or EIO on the master. Do not reap the child to decide when to stop:
    // output it already wrote is still buffered, and breaking early truncates
    // the answer.
    while Instant::now() < deadline {
        if !wait_readable(master, Duration::from_millis(20)) {
            continue;
        }
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                output.extend_from_slice(&buf[..n]);
                if !answered {
                    if let (Some(reply), true) = (reply, find(&output, QUERY).is_some()) {
                        write_master(master, reply);
                        answered = true;
                    }
                }
            }
            Err(_) => break,
        }
    }

    let mut status = 0;
    unsafe { libc::waitpid(pid, &mut status, 0) };
    let _ = std::fs::remove_file(&cache);

    Session {
        output,
        status: if libc::WIFEXITED(status) {
            libc::WEXITSTATUS(status)
        } else {
            -1
        },
    }
}

fn write_master(fd: libc::c_int, bytes: &[u8]) {
    let mut offset = 0;
    while offset < bytes.len() {
        let written = unsafe {
            libc::write(
                fd,
                bytes[offset..].as_ptr() as *const libc::c_void,
                bytes.len() - offset,
            )
        };
        if written <= 0 {
            return;
        }
        offset += written as usize;
    }
}

fn wait_readable(fd: libc::c_int, timeout: Duration) -> bool {
    let mut poll_fd = libc::pollfd {
        fd,
        events: libc::POLLIN,
        revents: 0,
    };
    unsafe { libc::poll(&mut poll_fd, 1, timeout.as_millis() as libc::c_int) > 0 }
}

const DARK_REPLY: &[u8] = b"\x1b]11;rgb:1515/1515/1515\x1b\\";
const LIGHT_REPLY: &[u8] = b"\x1b]11;rgb:ffff/ffff/ffff\x1b\\";

/// Generous, because `cargo test` runs these in parallel: a slow thread must
/// not read as a silent terminal. The default 150 ms is exercised separately.
const PATIENT: [&str; 4] = ["--no-cache", "--no-os", "--timeout", "2000"];

#[test]
fn reports_dark_from_a_dark_background() {
    let session = run_on_pty(&PATIENT, Some(DARK_REPLY), None);
    assert!(session.saw_query(), "should query the terminal");
    assert_eq!(session.printed(), "dark");
    assert_eq!(session.status, 0);
}

#[test]
fn reports_light_from_a_light_background() {
    // The fallback is dark, so this also proves the reply decided the answer.
    let session = run_on_pty(&PATIENT, Some(LIGHT_REPLY), None);
    assert_eq!(session.printed(), "light");
}

#[test]
fn never_echoes_the_reply() {
    for reply in [DARK_REPLY, LIGHT_REPLY] {
        let session = run_on_pty(&PATIENT, Some(reply), None);
        assert!(
            !session.echoed_reply(),
            "terminal echoed the reply: {:?}",
            String::from_utf8_lossy(&session.output)
        );
    }
}

#[test]
fn maps_the_reply_onto_a_variant() {
    let session = run_on_pty(
        &[
            "--no-cache",
            "--no-os",
            "--timeout",
            "2000",
            "senzu",
            "senzu-light",
        ],
        Some(LIGHT_REPLY),
        None,
    );
    assert_eq!(session.printed(), "senzu-light");
}

#[test]
fn falls_back_when_the_terminal_stays_silent() {
    let session = run_on_pty(
        &[
            "--no-cache",
            "--no-os",
            "--timeout",
            "80",
            "--default",
            "light",
        ],
        None,
        None,
    );
    assert!(session.saw_query(), "should have tried");
    assert_eq!(session.printed(), "light");
    assert_eq!(session.status, 0);
}

#[test]
fn skips_the_probe_when_the_user_typed_ahead() {
    let session = run_on_pty(
        &[
            "--no-cache",
            "--no-os",
            "--timeout",
            "2000",
            "--default",
            "dark",
        ],
        Some(DARK_REPLY),
        Some(b"typed before the probe\n"),
    );
    assert!(
        !session.saw_query(),
        "probing would have eaten the keystrokes"
    );
    assert_eq!(session.printed(), "dark");
}

#[test]
fn cached_only_never_reaches_the_terminal() {
    let session = run_on_pty(&["--cached-only", "--no-os"], Some(DARK_REPLY), None);
    assert!(!session.saw_query(), "--cached-only must not query");
}
