//! Command-line options.

use std::time::Duration;

use crate::appearance::Appearance;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

const DEFAULT_TIMEOUT_MS: u64 = 150;
const MIN_TIMEOUT_MS: u64 = 1;
const MAX_TIMEOUT_MS: u64 = 10_000;
const MAX_MAX_AGE_MS: u64 = 86_400_000;

pub const USAGE: &str = "\
senzu-appearance - report the terminal's appearance (dark/light)

Usage: senzu-appearance [options] [DARK_VARIANT LIGHT_VARIANT]

Options:
  --timeout MS     OSC 11 reply deadline (default 150)
  --max-age MS     reuse a cached answer younger than MS (0 never
                   reuses, which is the default)
  --cached-only    never touch the tty; env, cache, OS, default
  --no-cache       do not read or write the cache
  --no-os          do not fall back to the OS preference
  --default WHICH  answer when nothing else works (dark|light)
  -h, --help       show this help
  -V, --version    show version

Detection order: $SENZU_APPEARANCE, fresh cache, OSC 11, stale cache,
OS preference, --default.";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Options {
    pub timeout: Duration,
    pub max_age: Option<Duration>,
    pub cached_only: bool,
    pub use_cache: bool,
    pub use_os: bool,
    pub fallback: Appearance,
    pub variants: Option<(String, String)>,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            timeout: Duration::from_millis(DEFAULT_TIMEOUT_MS),
            max_age: Some(Duration::ZERO),
            cached_only: false,
            use_cache: true,
            use_os: true,
            fallback: Appearance::Dark,
            variants: None,
        }
    }
}

/// What `main` should do next. Help and version are outcomes, not side effects,
/// so parsing stays testable.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Parsed {
    Run(Box<Options>),
    Help,
    Version,
}

pub fn parse<I, S>(args: I) -> Result<Parsed, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut options = Options::default();
    let mut positional: Vec<String> = Vec::new();
    let mut args = args.into_iter().map(Into::into);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => return Ok(Parsed::Help),
            "-V" | "--version" => return Ok(Parsed::Version),
            "--cached-only" => options.cached_only = true,
            "--no-cache" => options.use_cache = false,
            "--no-os" => options.use_os = false,
            "--timeout" => {
                let value = args.next().ok_or("--timeout needs a value")?;
                let ms = bounded(&value, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS).ok_or(format!(
                    "--timeout takes {MIN_TIMEOUT_MS}-{MAX_TIMEOUT_MS} ms"
                ))?;
                options.timeout = Duration::from_millis(ms);
            }
            "--max-age" => {
                let value = args.next().ok_or("--max-age needs a value")?;
                let ms = bounded(&value, 0, MAX_MAX_AGE_MS)
                    .ok_or(format!("--max-age takes 0-{MAX_MAX_AGE_MS} ms"))?;
                options.max_age = Some(Duration::from_millis(ms));
            }
            "--default" => {
                let value = args.next().ok_or("--default needs a value")?;
                options.fallback = value.parse().map_err(|_| "--default takes dark|light")?;
            }
            other if other.starts_with('-') && other.len() > 1 => {
                return Err(format!("unknown option: {other}"));
            }
            other => positional.push(other.to_string()),
        }
    }

    match positional.len() {
        0 => {}
        2 => {
            let mut iter = positional.into_iter();
            let dark = iter.next().expect("checked length");
            let light = iter.next().expect("checked length");
            options.variants = Some((dark, light));
        }
        _ => return Err("give both variants or neither".to_string()),
    }
    Ok(Parsed::Run(Box::new(options)))
}

/// Rejects junk and out-of-range values: an unbounded timeout would overflow
/// the deadline arithmetic and blow past the `cc_t` range of `VTIME`.
fn bounded(text: &str, min: u64, max: u64) -> Option<u64> {
    let value: u64 = text.parse().ok()?;
    (min..=max).contains(&value).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(args: &[&str]) -> Options {
        match parse(args.to_vec()).expect("parses") {
            Parsed::Run(options) => *options,
            other => panic!("expected Run, got {other:?}"),
        }
    }

    #[test]
    fn defaults_probe_and_never_reuse_the_cache() {
        let options = run(&[]);
        assert_eq!(options.timeout, Duration::from_millis(150));
        assert_eq!(options.max_age, Some(Duration::ZERO));
        assert!(!options.cached_only);
        assert!(options.use_cache);
        assert!(options.use_os);
        assert_eq!(options.fallback, Appearance::Dark);
        assert_eq!(options.variants, None);
    }

    #[test]
    fn reads_flags() {
        let options = run(&[
            "--cached-only",
            "--no-cache",
            "--no-os",
            "--timeout",
            "300",
            "--max-age",
            "3000",
            "--default",
            "light",
        ]);
        assert!(options.cached_only);
        assert!(!options.use_cache);
        assert!(!options.use_os);
        assert_eq!(options.timeout, Duration::from_millis(300));
        assert_eq!(options.max_age, Some(Duration::from_millis(3000)));
        assert_eq!(options.fallback, Appearance::Light);
    }

    #[test]
    fn takes_a_variant_pair() {
        let options = run(&["senzu", "senzu-light"]);
        assert_eq!(
            options.variants,
            Some(("senzu".to_string(), "senzu-light".to_string()))
        );
    }

    #[test]
    fn rejects_a_single_variant() {
        assert!(parse(vec!["senzu"]).is_err());
    }

    #[test]
    fn rejects_three_variants() {
        assert!(parse(vec!["a", "b", "c"]).is_err());
    }

    #[test]
    fn rejects_out_of_range_timeouts() {
        assert!(parse(vec!["--timeout", "0"]).is_err());
        assert!(parse(vec!["--timeout", "99999"]).is_err());
        assert!(parse(vec!["--timeout", "-1"]).is_err());
        assert!(parse(vec!["--timeout", "abc"]).is_err());
        assert!(parse(vec!["--timeout"]).is_err());
    }

    #[test]
    fn rejects_out_of_range_max_age() {
        assert!(parse(vec!["--max-age", "-1"]).is_err());
        assert!(parse(vec!["--max-age", "999999999"]).is_err());
        assert!(parse(vec!["--max-age", "0"]).is_ok(), "zero is meaningful");
    }

    #[test]
    fn rejects_unknown_options() {
        assert!(parse(vec!["--nope"]).is_err());
        assert!(parse(vec!["--default", "chartreuse"]).is_err());
    }

    #[test]
    fn returns_help_and_version() {
        assert_eq!(parse(vec!["--help"]), Ok(Parsed::Help));
        assert_eq!(parse(vec!["-h"]), Ok(Parsed::Help));
        assert_eq!(parse(vec!["--version"]), Ok(Parsed::Version));
        assert_eq!(parse(vec!["-V"]), Ok(Parsed::Version));
    }
}
