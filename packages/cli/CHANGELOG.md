# @senzu/cli

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
