---
"@senzu/cli": minor
---

Add a portable shell appearance-detection script (`share/shell/senzu-appearance.sh`).

The script prints the terminal's current appearance (`dark`/`light`) so consumers can pick a Senzu variant for programs with no native dark/light switching (bat, fzf). It queries the terminal background via the OSC 11 escape sequence (works in Ghostty and other modern terminals; background luminance decides dark/light, timeout-protected), then falls back to the macOS `AppleInterfaceStyle` and Linux `gsettings` color-scheme, then a `light` default. `SENZU_APPEARANCE` (and the legacy `CATEN_APPEARANCE`) overrides everything.

The Home Manager module installs it to `~/.config/senzu/senzu-appearance.sh` (`programs.senzu.shell.enable`, default true). It is a hand-maintained support script, not a generator output.
