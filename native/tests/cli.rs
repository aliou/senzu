//! End-to-end checks against the built binary. These never reach a terminal:
//! `cargo test` runs without one attached to the test process, and every case
//! here either overrides detection or forbids it.

use std::process::Command;

fn senzu(args: &[&str], env: &[(&str, &str)]) -> (String, String, i32) {
    let mut command = Command::new(env!("CARGO_BIN_EXE_senzu-appearance"));
    command.args(args);
    command.env_remove("SENZU_APPEARANCE");
    for (key, value) in env {
        command.env(key, value);
    }

    let output = command.output().expect("runs");
    (
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
        output.status.code().unwrap_or(-1),
    )
}

fn cache_file(name: &str) -> String {
    std::env::temp_dir()
        .join(format!("senzu-cli-test-{}-{}", name, std::process::id()))
        .to_string_lossy()
        .into_owned()
}

#[test]
fn env_override_wins() {
    let (out, _, code) = senzu(&[], &[("SENZU_APPEARANCE", "light")]);
    assert_eq!(out, "light");
    assert_eq!(code, 0);
}

#[test]
fn maps_the_variant_pair() {
    let (out, _, _) = senzu(&["senzu", "senzu-light"], &[("SENZU_APPEARANCE", "light")]);
    assert_eq!(out, "senzu-light");

    let (out, _, _) = senzu(&["senzu", "senzu-light"], &[("SENZU_APPEARANCE", "dark")]);
    assert_eq!(out, "senzu");
}

#[test]
fn falls_back_to_the_default_when_nothing_knows() {
    let cache = cache_file("fallback");
    let _ = std::fs::remove_file(&cache);

    let (out, _, code) = senzu(
        &["--cached-only", "--no-os", "--default", "light"],
        &[("SENZU_APPEARANCE_CACHE", cache.as_str())],
    );
    assert_eq!(out, "light");
    assert_eq!(code, 0);
}

#[test]
fn reads_a_cached_answer() {
    let cache = cache_file("cached");
    std::fs::write(&cache, "light\n").unwrap();

    let (out, _, _) = senzu(
        &["--cached-only", "--no-os"],
        &[("SENZU_APPEARANCE_CACHE", cache.as_str())],
    );
    assert_eq!(out, "light");
    let _ = std::fs::remove_file(&cache);
}

#[test]
fn cached_only_never_writes_the_cache() {
    let cache = cache_file("readonly");
    let _ = std::fs::remove_file(&cache);

    senzu(
        &["--cached-only", "--no-os"],
        &[("SENZU_APPEARANCE_CACHE", cache.as_str())],
    );
    assert!(!std::path::Path::new(&cache).exists());
}

#[test]
fn rejects_bad_arguments_with_exit_code_two() {
    for args in [
        vec!["--timeout", "99999"],
        vec!["--timeout", "abc"],
        vec!["--max-age", "-1"],
        vec!["--default", "chartreuse"],
        vec!["--nope"],
        vec!["senzu"],
    ] {
        let (_, err, code) = senzu(&args, &[]);
        assert_eq!(code, 2, "{args:?} should fail");
        assert!(err.contains("senzu-appearance:"), "{args:?}: {err}");
    }
}

#[test]
fn prints_help_and_version() {
    let (out, _, code) = senzu(&["--help"], &[]);
    assert!(out.starts_with("senzu-appearance -"));
    assert_eq!(code, 0);

    let (out, _, code) = senzu(&["--version"], &[]);
    assert_eq!(out, env!("CARGO_PKG_VERSION"));
    assert_eq!(code, 0);
}
