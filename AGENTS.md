# Project Guide

## Commands

- **Generate themes**: `pnpm generate` (regenerates all `share/` outputs from `config.json`)
- **List palettes/targets**: `pnpm list`
- **Install themes**: `pnpm install:themes` (symlinks to default dirs) or `pnpm install:themes -- install <target> [variant]`
- **Build CLI**: `pnpm build` (tsdown -> dist/)
- **Lint/Format**: `pnpm lint` (check) or `pnpm format` (apply fixes). Uses Biome with `@aliou/biome-plugins`.
- **Typecheck**: `pnpm typecheck` (`tsc --noEmit`)
- **Changeset**: `pnpm changeset`
- **Dev shell**: `nix develop` or `use flake` (direnv) — provides Node.js 24 + pnpm

## Architecture

`senzu` is a single-package Node.js CLI that generates color scheme files for multiple terminal and editor applications from one canonical source of truth (`config.json`).

- **Structure**:
  - `src/core/` — types, zod schema, config loader
  - `src/generators/` — one generator per target format (ghostty, wezterm, tmux, neovim, zed, pi)
  - `src/cli/` — CLI entry point (`generate`, `list`, `install` commands)
  - `config.json` — canonical palette definitions for all 9 variants
  - `share/` — generated output (committed, consumed by nix)
  - `nix/home-manager.nix` — Nix home-manager module for installing themes
  - `flake.nix` — Nix flake: themes package + CLI app + devshell with git-hooks

- **Generator contract**: Each generator implements `emit(palettes[]): OutputFile[]`. Per-palette generators (ghostty, wezterm, tmux, neovim, pi) produce one file per variant. Family generators (zed) produce a single file from all palettes.

- **Variants**: 9 total — `senzu` (default dark), `senzu-mono`, `senzu-light`, `senzu-mono-light`, `senzu-muted`, `senzu-muted-light`, `senzu-hc`, `senzu-hc-light`, `senzu-warm`.

- **Targets**: `ghostty`, `wezterm` (TOML only — the canonical format for `~/.config/wezterm/colors/`), `tmux`, `neovim`, `zed` (theme family JSON), `pi` (Pi coding agent theme JSON with var references).

- **Versioning**: The version in `package.json` is the single source. The flake reads it for both the themes package (`senzu-themes`) and the CLI (`senzu`). Use changesets to bump.

- **Pre-commit hooks** (via git-hooks.nix): biome check, typecheck, themes-up-to-date (regenerates `share/` and fails if changed), lockfile-up-to-date (`pnpm install --frozen-lockfile` fails if drift).

## Code Style & Conventions

- **Tooling**: `pnpm` for script execution, `tsx` as the TypeScript runner, `tsdown` for CLI builds.
- **Formatting**: Enforced by **Biome** — double quotes, 2-space indent, organized imports.
- **TypeScript**: Strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Use `import type` for type-only imports.
- **Validation**: `zod` validates `config.json` at load time.
- **Deterministic output**: Generators produce stable key order and trailing newlines so `share/` diffs stay clean.

## Adding a new variant

1. Add the palette entry to `config.json` under `palettes` with all required fields.
2. Run `pnpm generate` to produce output for all targets.
3. Add the variant name to `allVariants` in `nix/home-manager.nix`.

## Adding a new generator

1. Create `src/generators/<name>.ts` extending `PerPaletteGenerator` (one file per variant) or `FamilyGenerator` (one file from all variants).
2. Implement `generate()` returning the file contents string.
3. Register the generator in `src/generators/index.ts`.
4. Run `pnpm generate <name>` to test.
5. Add the install logic to `nix/home-manager.nix` if it needs home-manager integration.
