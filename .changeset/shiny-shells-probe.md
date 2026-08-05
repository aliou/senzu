---
"senzu": minor
---

Add `senzu-appearance`: a small binary that reports the terminal's current appearance (dark/light) by asking for its background with OSC 11, so bat, delta and fzf can follow a theme pinned independent of the OS. Exactly one process may query the terminal — everything else reads the answer from the cache or the environment, so the reply is never echoed as garbage and the terminal is always restored. Ships with `share/shell/senzu-hook.zsh` (throttled `precmd` probe that exports `SENZU_APPEARANCE`, `SENZU_VARIANT`, `BAT_THEME`, `DELTA_FEATURES` and `FZF_DEFAULT_OPTS`) and a compatibility shim for the old `senzu-appearance.sh` callers. Prebuilt binaries are attached to each release for `aarch64-darwin`, `aarch64-linux` and `x86_64-linux`; the flake downloads them instead of building. See `docs/appearance-detection.md`.
