# @senzu/cli

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
