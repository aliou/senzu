---
"@senzu/cli": minor
---

Add `bat` and `fzf` generators.

- `bat` emits TextMate `.tmTheme` files (one per variant) under `share/bat/`,
  mapping Senzu syntax colors to TextMate scopes. bat/delta load them from
  `~/.config/bat/themes/` after `bat cache --build`; select with
  `bat --theme=senzu` or `BAT_THEME=senzu`.
- `fzf` emits per-variant shell snippets under `share/fzf/` that append a
  Senzu `--color` spec to `FZF_DEFAULT_OPTS` when sourced, so they compose
  with existing fzf layout/key-binding options.

Both targets are registered in the CLI and `nix/home-manager.nix`, with
default install dirs `~/.config/bat/themes` and `~/.config/fzf`.
