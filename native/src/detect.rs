//! Detection order: which source of truth wins, and what happens when each
//! one has nothing to say.
//!
//! The policy is separated from the sources so it can be tested without a
//! terminal, a cache directory, or an operating system preference.

use std::path::PathBuf;
use std::time::Duration;

use crate::appearance::{self, Appearance};
use crate::cache;
use crate::cli::Options;
use crate::probe::{self, ProbeStatus};

/// Everything `detect` needs from the outside world.
pub trait Sources {
    fn env(&self) -> Option<Appearance>;
    /// `max_age: None` accepts a cached answer of any age.
    fn cache_read(&self, max_age: Option<Duration>) -> Option<Appearance>;
    fn cache_write(&self, value: Appearance);
    fn probe(&self, timeout: Duration) -> ProbeStatus;
    fn os(&self) -> Option<Appearance>;
}

/// `$SENZU_APPEARANCE`, fresh cache, OSC 11, stale cache, OS, `--default`.
pub fn detect(options: &Options, sources: &dyn Sources) -> Appearance {
    if let Some(value) = sources.env() {
        return value;
    }

    // `--cached-only` has no fresher source to wait for, so any age will do.
    let max_age = if options.cached_only {
        None
    } else {
        options.max_age
    };
    if let Some(value) = sources.cache_read(max_age) {
        return value;
    }

    if !options.cached_only {
        if let ProbeStatus::Answered(value) = sources.probe(options.timeout) {
            sources.cache_write(value);
            return value;
        }
    }

    // A stale cache beats the OS preference: it came from this terminal.
    if let Some(value) = sources.cache_read(None) {
        return value;
    }
    if options.use_os {
        if let Some(value) = sources.os() {
            return value;
        }
    }
    options.fallback
}

/// The real sources. Resolves the cache paths once, since both the entry and
/// its lock are keyed by the terminal.
pub struct SystemSources {
    cache: Option<PathBuf>,
    lock: Option<PathBuf>,
}

impl SystemSources {
    pub fn new(options: &Options) -> Self {
        SystemSources {
            cache: options.use_cache.then(cache::path).flatten(),
            // Resolved even when the cache is disabled: the lock is what keeps
            // two probes on one terminal from colliding.
            lock: cache::lock_path(),
        }
    }
}

impl Sources for SystemSources {
    fn env(&self) -> Option<Appearance> {
        appearance::from_env()
    }

    fn cache_read(&self, max_age: Option<Duration>) -> Option<Appearance> {
        cache::read(self.cache.as_deref()?, max_age)
    }

    fn cache_write(&self, value: Appearance) {
        if let Some(path) = &self.cache {
            cache::write(path, value);
        }
    }

    fn probe(&self, timeout: Duration) -> ProbeStatus {
        probe::probe(timeout, self.lock.as_deref())
    }

    fn os(&self) -> Option<Appearance> {
        appearance::from_os()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Debug, PartialEq, Eq)]
    enum Call {
        Env,
        CacheRead(Option<Duration>),
        CacheWrite(Appearance),
        Probe,
        Os,
    }

    #[derive(Default)]
    struct FakeSources {
        env: Option<Appearance>,
        fresh_cache: Option<Appearance>,
        stale_cache: Option<Appearance>,
        probe: Option<ProbeStatus>,
        os: Option<Appearance>,
        calls: RefCell<Vec<Call>>,
    }

    impl FakeSources {
        fn calls(&self) -> Vec<String> {
            self.calls
                .borrow()
                .iter()
                .map(|c| format!("{c:?}"))
                .collect()
        }

        fn probed(&self) -> bool {
            self.calls.borrow().contains(&Call::Probe)
        }
    }

    impl Sources for FakeSources {
        fn env(&self) -> Option<Appearance> {
            self.calls.borrow_mut().push(Call::Env);
            self.env
        }

        fn cache_read(&self, max_age: Option<Duration>) -> Option<Appearance> {
            self.calls.borrow_mut().push(Call::CacheRead(max_age));
            // `None` is the stale read; anything else asks for a fresh entry.
            match max_age {
                None => self.stale_cache.or(self.fresh_cache),
                Some(_) => self.fresh_cache,
            }
        }

        fn cache_write(&self, value: Appearance) {
            self.calls.borrow_mut().push(Call::CacheWrite(value));
        }

        fn probe(&self, _timeout: Duration) -> ProbeStatus {
            self.calls.borrow_mut().push(Call::Probe);
            self.probe.unwrap_or(ProbeStatus::Unavailable)
        }

        fn os(&self) -> Option<Appearance> {
            self.calls.borrow_mut().push(Call::Os);
            self.os
        }
    }

    fn options() -> Options {
        Options::default()
    }

    #[test]
    fn the_environment_wins_over_everything() {
        let sources = FakeSources {
            env: Some(Appearance::Light),
            fresh_cache: Some(Appearance::Dark),
            probe: Some(ProbeStatus::Answered(Appearance::Dark)),
            os: Some(Appearance::Dark),
            ..Default::default()
        };

        assert_eq!(detect(&options(), &sources), Appearance::Light);
        assert_eq!(sources.calls(), vec!["Env"], "nothing else is consulted");
    }

    #[test]
    fn a_fresh_cache_entry_skips_the_probe() {
        let mut options = options();
        options.max_age = Some(Duration::from_secs(3));
        let sources = FakeSources {
            fresh_cache: Some(Appearance::Light),
            probe: Some(ProbeStatus::Answered(Appearance::Dark)),
            ..Default::default()
        };

        assert_eq!(detect(&options, &sources), Appearance::Light);
        assert!(!sources.probed(), "the terminal must not be touched");
    }

    #[test]
    fn the_probe_answer_wins_and_is_cached() {
        let sources = FakeSources {
            probe: Some(ProbeStatus::Answered(Appearance::Light)),
            os: Some(Appearance::Dark),
            ..Default::default()
        };

        assert_eq!(detect(&options(), &sources), Appearance::Light);
        assert!(
            sources
                .calls
                .borrow()
                .contains(&Call::CacheWrite(Appearance::Light)),
            "a fresh answer must be cached for the tools"
        );
    }

    #[test]
    fn a_busy_probe_falls_back_to_a_stale_entry() {
        let sources = FakeSources {
            stale_cache: Some(Appearance::Light),
            probe: Some(ProbeStatus::Busy),
            os: Some(Appearance::Dark),
            ..Default::default()
        };

        assert_eq!(detect(&options(), &sources), Appearance::Light);
    }

    #[test]
    fn a_stale_entry_beats_the_operating_system() {
        let sources = FakeSources {
            stale_cache: Some(Appearance::Light),
            probe: Some(ProbeStatus::Unavailable),
            os: Some(Appearance::Dark),
            ..Default::default()
        };

        assert_eq!(
            detect(&options(), &sources),
            Appearance::Light,
            "the cache came from this terminal; the OS preference did not"
        );
    }

    #[test]
    fn the_operating_system_is_the_last_signal_before_the_default() {
        let sources = FakeSources {
            probe: Some(ProbeStatus::Unavailable),
            os: Some(Appearance::Light),
            ..Default::default()
        };

        assert_eq!(detect(&options(), &sources), Appearance::Light);
    }

    #[test]
    fn no_os_skips_the_operating_system() {
        let mut options = options();
        options.use_os = false;
        options.fallback = Appearance::Dark;
        let sources = FakeSources {
            probe: Some(ProbeStatus::Unavailable),
            os: Some(Appearance::Light),
            ..Default::default()
        };

        assert_eq!(detect(&options, &sources), Appearance::Dark);
        assert!(!sources.calls().contains(&"Os".to_string()));
    }

    #[test]
    fn everything_silent_returns_the_default() {
        let mut options = options();
        options.fallback = Appearance::Light;

        assert_eq!(detect(&options, &FakeSources::default()), Appearance::Light);
    }

    #[test]
    fn cached_only_never_probes_and_accepts_any_age() {
        let mut options = options();
        options.cached_only = true;
        let sources = FakeSources {
            stale_cache: Some(Appearance::Light),
            probe: Some(ProbeStatus::Answered(Appearance::Dark)),
            ..Default::default()
        };

        assert_eq!(detect(&options, &sources), Appearance::Light);
        assert!(!sources.probed(), "--cached-only must not touch the tty");
        assert_eq!(
            sources.calls(),
            vec!["Env", "CacheRead(None)"],
            "one read, with no age limit"
        );
    }

    #[test]
    fn the_default_max_age_forces_a_probe() {
        let sources = FakeSources {
            fresh_cache: Some(Appearance::Light),
            probe: Some(ProbeStatus::Answered(Appearance::Dark)),
            ..Default::default()
        };

        // Options::default() is max-age 0, which never reuses. The fake still
        // returns a value for a fresh read, so this pins the call shape: the
        // real cache is what enforces the age.
        assert_eq!(
            sources.calls.borrow().len(),
            0,
            "sanity check before running detect"
        );
        let _ = detect(&options(), &sources);
        assert_eq!(
            sources.calls()[1],
            format!("{:?}", Call::CacheRead(Some(Duration::ZERO))),
            "the age limit is passed through to the cache"
        );
    }
}
