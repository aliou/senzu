//! The appearance value, plus the cheap ways of guessing it that do not
//! involve the terminal.

use std::env;
use std::process::Command;
use std::str::FromStr;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Appearance {
    Dark,
    Light,
}

impl Appearance {
    pub fn as_str(self) -> &'static str {
        match self {
            Appearance::Dark => "dark",
            Appearance::Light => "light",
        }
    }
}

impl FromStr for Appearance {
    type Err = ();

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "dark" => Ok(Appearance::Dark),
            "light" => Ok(Appearance::Light),
            _ => Err(()),
        }
    }
}

/// `$SENZU_APPEARANCE` override.
pub fn from_env() -> Option<Appearance> {
    env::var("SENZU_APPEARANCE").ok()?.trim().parse().ok()
}

/// OS preference. Last resort only: this is not the terminal's background, and
/// a pinned theme makes them disagree.
pub fn from_os() -> Option<Appearance> {
    let output = if cfg!(target_os = "macos") {
        Command::new("defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output()
            .ok()?
    } else {
        Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output()
            .ok()?
    };
    from_os_output(&String::from_utf8_lossy(&output.stdout))
}

fn from_os_output(text: &str) -> Option<Appearance> {
    let text = text.to_lowercase();
    if text.contains("dark") {
        Some(Appearance::Dark)
    } else if text.contains("light") {
        Some(Appearance::Light)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_values() {
        assert_eq!("dark".parse(), Ok(Appearance::Dark));
        assert_eq!("light".parse(), Ok(Appearance::Light));
    }

    #[test]
    fn rejects_everything_else() {
        assert!("".parse::<Appearance>().is_err());
        assert!("Dark".parse::<Appearance>().is_err());
        assert!("darkish".parse::<Appearance>().is_err());
    }

    #[test]
    fn round_trips_through_as_str() {
        for value in [Appearance::Dark, Appearance::Light] {
            assert_eq!(value.as_str().parse(), Ok(value));
        }
    }

    #[test]
    fn reads_os_output() {
        assert_eq!(from_os_output("Dark\n"), Some(Appearance::Dark));
        assert_eq!(from_os_output("'prefer-light'\n"), Some(Appearance::Light));
        assert_eq!(from_os_output("'default'\n"), None);
        assert_eq!(from_os_output(""), None);
    }
}
