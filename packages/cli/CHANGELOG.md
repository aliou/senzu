# @senzu/cli

## 0.11.0

### Minor Changes

- 0720900: Add light counterparts for the warm and cold Senzu variants.

## 0.9.0

### Minor Changes

- cefe62a: Add a Hunk generator that emits merge-ready TOML theme snippets for every Senzu variant, in both the modern `[themes.<id>]` format (hunk >= 0.18) and the legacy `[custom_theme]` format (hunk <= 0.17).

## 0.8.0

### Minor Changes

- cbb9a71: Add a Herdr generator that emits manual-copy TOML theme snippets for every Senzu variant.
- 661e981: Safely install an explicit Senzu variant into Herdr's existing config with comment-preserving TOML updates, timestamped backups, dry runs, and guarded symlink handling. Expose Herdr theme attrsets through the flake library for declarative Nix configuration.

## 0.7.1

### Patch Changes

- 538e88f: Add the Pi `scrollbarThumb` color token to all generated themes so fullscreen scrollbars use the palette's solid scrollbar color.

## 0.7.0

### Minor Changes

- e7b625c: Add `senzu-cold` variant: a dark palette that retints Senzu's neutral scale toward blue, mirroring how `senzu-warm` retints it toward brown/yellow. Accent colors are unchanged from the base theme.
- 1882621: Add `senzu-appearance`: a small binary that reports the terminal's current appearance (dark/light) by asking for its background with OSC 11, so bat, delta and fzf can follow a theme pinned independent of the OS. Exactly one process may query the terminal — everything else reads the answer from the cache or the environment, so the reply is never echoed as garbage and the terminal is always restored. Ships with `share/shell/senzu-hook.zsh` (throttled `precmd` probe that exports `SENZU_APPEARANCE`, `SENZU_VARIANT`, `BAT_THEME`, `DELTA_FEATURES` and `FZF_DEFAULT_OPTS`) and a compatibility shim for the old `senzu-appearance.sh` callers. Prebuilt binaries are attached to each release for `aarch64-darwin`, `aarch64-linux` and `x86_64-linux`; the flake downloads them instead of building. See `docs/appearance-detection.md`.

## 0.6.0

### Minor Changes

- 3a98d36: Add a portable shell appearance-detection script (`share/shell/senzu-appearance.sh`).

  The script prints the terminal's current appearance (`dark`/`light`) so consumers can pick a Senzu variant for programs with no native dark/light switching (bat, fzf). It queries the terminal background via the OSC 11 escape sequence (works in Ghostty and other modern terminals; background luminance decides dark/light, timeout-protected), then falls back to the macOS `AppleInterfaceStyle` and Linux `gsettings` color-scheme, then a `light` default. `SENZU_APPEARANCE` (and the legacy `CATEN_APPEARANCE`) overrides everything.

  The Home Manager module installs it to `~/.config/senzu/senzu-appearance.sh` (`programs.senzu.shell.enable`, default true). It is a hand-maintained support script, not a generator output.

## 0.5.0

### Minor Changes

- 7fb658f: Add Yazi file manager flavors for every Senzu variant.

  Each flavor includes Yazi UI colors and a matching TextMate theme for syntax-highlighted previews. The CLI and Home Manager module install the flavor directories under `~/.config/yazi/flavors`.

## 0.4.0

### Minor Changes

- 6554022: Add `bat` and `fzf` generators.

  - `bat` emits TextMate `.tmTheme` files (one per variant) under `share/bat/`,
    mapping Senzu syntax colors to TextMate scopes. bat/delta load them from
    `~/.config/bat/themes/` after `bat cache --build`; select with
    `bat --theme=senzu` or `BAT_THEME=senzu`.
  - `fzf` emits per-variant shell snippets under `share/fzf/` that append a
    Senzu `--color` spec to `FZF_DEFAULT_OPTS` when sourced, so they compose
    with existing fzf layout/key-binding options.

  Both targets are registered in the CLI and `nix/home-manager.nix`, with
  default install dirs `~/.config/bat/themes` and `~/.config/fzf`.

- 630e84e: Add `thinkingMax` theme token for the new pi max thinking level. The thinking
  border rotation now follows pi's native cool→warm hue escalation
  (grey → blue → lavender → rose → amber → hot magenta) instead of the previous
  non-monotonic green → blue → amber sequence. A per-variant `fuchsia` swatch
  is added to `config.json` as the max endpoint, tuned for each palette's
  appearance and saturation.

### Patch Changes

- 7b2fa3c: Fix invalid highlight color in neovim colorscheme. The active line background
  slot uses an alpha hex (`#rrggbbaa`) which is valid in Zed but rejected by
  Neovim's `nvim_set_hl` with `E5113: Invalid highlight color`. The neovim
  generator now composites the alpha over the palette background, producing
  opaque `#rrggbb` values.

## 0.3.1

### Patch Changes

- 0923795: Add TreeSitter highlight groups to the Neovim theme generator.

## 0.3.0

### Minor Changes

- 8b2d03c: Add TextMate theme generator

  Generate Shiki/VS Code-compatible TextMate themes for all nine Senzu variants.

## 0.2.0

### Minor Changes

- 6c46c73: senzu CLI gains an interactive `preview` command that re-themes the whole
  terminal via OSC (default bg/fg/cursor + 16-color palette), shows a
  bat-style syntax-highlighted code sample, and supports arrow-key palette
  switching with resize handling. Version is now read from package.json.

  The repo is now a pnpm workspace monorepo with the CLI in
  `packages/cli` (`@senzu/cli`); the flake devShell exposes a live `senzu`
  bin (tsx against the working tree).

  Fixed: senzu-hc-light comment/bright-black was too faint on the light
  background (ghostty terminal comments were invisible); neovim/wezterm/
  tmux light variants rendered dark surfaces because generators looked up
  non-existent dotted UI keys and fell back to `#1c1c1c`.
