//! senzu-appearance - report the terminal's current appearance (dark/light).
//!
//! Queries the terminal background with OSC 11 and decides dark/light from its
//! luminance. The terminal background is the signal, not the OS preference: a
//! pinned dark theme on a light system must report dark.
//!
//! Only the shell hook should run this. Tools that run per keystroke (fzf) or
//! per pipeline (bat, delta) must never probe: they read the variant from the
//! environment the hook exports. See docs/appearance-detection.md.
//!
//! Layout:
//!   appearance.rs  the value, plus env and OS fallbacks
//!   osc.rs         OSC 11 wire format (pure, tested)
//!   probe.rs       the tty query: lock, echo off, restore
//!   cache.rs       per-terminal answer cache
//!   cli.rs         option parsing
//!   detect.rs      which source wins
//!   main.rs        wiring and output

mod appearance;
mod cache;
mod cli;
mod detect;
mod osc;
mod probe;

use appearance::Appearance;
use cli::Parsed;
use detect::SystemSources;

fn main() {
    let options = match cli::parse(std::env::args().skip(1)) {
        Ok(Parsed::Run(options)) => *options,
        Ok(Parsed::Help) => {
            println!("{}", cli::USAGE);
            return;
        }
        Ok(Parsed::Version) => {
            println!("{}", cli::VERSION);
            return;
        }
        Err(message) => {
            eprintln!("senzu-appearance: {message}");
            eprintln!("{}", cli::USAGE);
            std::process::exit(2);
        }
    };

    let result = detect::detect(&options, &SystemSources::new(&options));
    match &options.variants {
        Some((dark, light)) => {
            println!(
                "{}",
                if result == Appearance::Dark {
                    dark
                } else {
                    light
                }
            )
        }
        None => println!("{}", result.as_str()),
    }
}
