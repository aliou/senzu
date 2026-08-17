# Project Guide

## Commands

`just` lists every recipe; `just check` runs what CI runs. The `pnpm` scripts below still work and are what the recipes call.

- **Generate themes**: `pnpm generate` (regenerates all `share/` outputs from `themes/`)
- **List palettes/targets**: `pnpm list`
- **Install themes**: `pnpm install:themes` (symlinks to default dirs) or `pnpm install:themes -- install <target> [variant]`
- **Build CLI**: `pnpm build` (tsdown -> dist/)
- **Lint/Format**: `pnpm lint` (check) or `pnpm format` (apply fixes). Uses Biome with `@aliou/biome-plugins`.
- **Typecheck**: `pnpm typecheck` (`tsc --noEmit`)
- **Changeset**: `pnpm changeset`
- **Appearance probe**: `just test-native` (58 tests), `just build-native`, `just clippy`
- **Dev shell**: `nix develop` or `use flake` (direnv) — Node.js 24, pnpm, just, and the Rust toolchain

## Architecture

`senzu` generates color scheme files for multiple terminal and editor applications from canonical family files in `themes/`. The generator is a pnpm workspace package; a small Rust binary handles terminal appearance detection.

- **Structure**:
  - `packages/cli/src/core/` — types, zod schema, config loader
  - `packages/cli/src/generators/` — one generator per target format
  - `packages/cli/src/cli/` — CLI entry point (`generate`, `list`, `install`, `preview`)
  - `themes/` — canonical palette definitions split by family, with `index.json` preserving variant order
  - `share/` — generated output (committed, consumed by nix)
  - `native/` — `senzu-appearance`, the terminal appearance probe (Rust). See `docs/appearance-detection.md`
  - `nix/home-manager.nix` — Nix home-manager module for installing themes and the probe
  - `flake.nix` — Nix flake: themes package, appearance probe, devshell with git-hooks

- **Generator contract**: Each generator implements `emit(palettes[]): OutputFile[]`. Per-palette generators (ghostty, wezterm, wterm, tmux, herdr, neovim, pi, textmate, bat, fzf) produce one file per variant. Family generators (zed) produce a single file from all palettes.

- **Variants**: 9 total — `senzu` (default dark), `senzu-mono`, `senzu-light`, `senzu-mono-light`, `senzu-muted`, `senzu-muted-light`, `senzu-hc`, `senzu-hc-light`, `senzu-warm`.

- **Targets**: `ghostty`, `wezterm` (TOML only — the canonical format for `~/.config/wezterm/colors/`), `wterm`, `tmux`, `herdr` (TOML config snippets plus safe config patching), `neovim`, `zed` (theme family JSON), `pi` (Pi coding agent theme JSON with var references), `textmate` (Shiki/VS Code JSON), `bat` (TextMate `.tmTheme` for bat/delta), `fzf` (`--color` snippets sourced into `FZF_DEFAULT_OPTS`).

- **Versioning**: The version in `package.json` is the single source. The flake reads it for the themes package, and `native/Cargo.toml` must match it because the probe binary is published under the release tag (`just sync-version`). Use changesets to bump.

- **Appearance probe distribution**: the release workflow builds `senzu-appearance` for `aarch64-darwin`, `aarch64-linux` (static musl) and `x86_64-linux` (static musl), attaches them to the GitHub release, and rewrites `appearanceVersion` plus the three hashes in `flake.nix`. Those marker comments (`# appearance-version`, `# darwin`, `# linux-arm64`, `# linux-x64`) are load-bearing — do not reformat them. While the hashes are placeholders, `.#appearance` builds from source.

- **Pre-commit hooks** (via git-hooks.nix): biome check, typecheck, themes-up-to-date (regenerates `share/` and fails if changed), lockfile-up-to-date (`pnpm install --frozen-lockfile` fails if drift).

- **Hand-maintained `share/` files**: `share/` is almost entirely generator output, but `share/shell/senzu-appearance.sh` is a hand-maintained support script (appearance detection for bat/fzf dark/light switching). It is not produced by a generator; `pnpm generate` leaves it untouched. The themes package still ships it via `cp -r share/*`.

## Code Style & Conventions

- **Tooling**: `pnpm` for script execution, `tsx` as the TypeScript runner, `tsdown` for CLI builds.
- **Formatting**: Enforced by **Biome** — double quotes, 2-space indent, organized imports.
- **TypeScript**: Strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Use `import type` for type-only imports.
- **Validation**: `zod` validates `themes/` at load time.
- **Deterministic output**: Generators produce stable key order and trailing newlines so `share/` diffs stay clean.

## Adding a new variant

1. Add the palette entry to the relevant family file in `themes/` and add its key to `themes/index.json`.
2. Run `pnpm generate` to produce output for all targets.
3. Add the variant name to `allVariants` in `nix/home-manager.nix`.

## Adding a new generator

1. Create `packages/cli/src/generators/<name>.ts` extending `PerPaletteGenerator` (one file per variant) or `FamilyGenerator` (one file from all variants).
2. Implement `generate()` returning the file contents string.
3. Register the generator in `packages/cli/src/generators/index.ts`.
4. Run `pnpm generate <name>` to test.
5. Add install logic only where the target supports standalone theme files. For config-owning tools such as Herdr, expose composable Nix data instead of creating a competing config file.
