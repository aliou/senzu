# senzu - run `just` to list recipes.

_default:
    @just --list --unsorted

# --- themes ------------------------------------------------------------------

# Regenerate every target in share/ from config.json.
generate target="":
    pnpm generate {{ target }}

# List palettes and targets.
list:
    pnpm list

# Symlink themes into a program's config dir, e.g. `just install ghostty senzu`.
install target variant="all":
    pnpm install:themes -- install {{ target }} {{ variant }}

# Preview a palette in the terminal.
preview variant="":
    pnpm exec tsx packages/cli/src/cli/index.ts preview {{ variant }}

# Regenerate the README theme previews.
previews:
    pnpm readme:previews

# --- checks ------------------------------------------------------------------

# Everything CI runs.
check: lint typecheck test-native themes-current version-current

# Biome check.
lint:
    pnpm lint

# Biome check with fixes applied.
format:
    pnpm format

typecheck:
    pnpm typecheck

# Fail if share/ is out of date with config.json and the generators.
themes-current: generate
    git diff --exit-code -- share/

# Fail if the probe version has drifted from the release version. The release
# workflow builds the binary at the release version, so they must match.
version-current:
    #!/usr/bin/env bash
    set -euo pipefail
    release=$(jq -r '.version' package.json)
    probe=$(grep -m1 '^version = ' native/Cargo.toml | cut -d'"' -f2)
    if [ "$release" != "$probe" ]; then
      echo "native/Cargo.toml is $probe but package.json is $release. Run: just sync-version"
      exit 1
    fi

# Copy the release version into the probe manifest.
sync-version:
    #!/usr/bin/env bash
    set -euo pipefail
    release=$(jq -r '.version' package.json)
    sed -i "0,/^version = .*/s//version = \"${release}\"/" native/Cargo.toml
    sed -i "/^name = \"senzu-appearance\"$/{n;s/^version = .*/version = \"${release}\"/}" native/Cargo.lock
    echo "probe version set to ${release}"

# --- appearance probe (native/) ----------------------------------------------

# Build the probe.
build-native:
    cargo build --release --manifest-path native/Cargo.toml

# Unit, CLI and pty tests.
test-native:
    cargo test --manifest-path native/Cargo.toml

# Terminal-level tests only, with output.
test-pty:
    cargo test --manifest-path native/Cargo.toml --test pty -- --nocapture

fmt-native:
    cargo fmt --manifest-path native/Cargo.toml

clippy:
    cargo clippy --manifest-path native/Cargo.toml --all-targets -- -D warnings

# Run the probe from the working tree, e.g. `just probe "senzu senzu-light"`.
probe args="":
    cargo run --quiet --manifest-path native/Cargo.toml -- {{ args }}

# --- nix ---------------------------------------------------------------------

# Build the themes package.
build:
    nix build .#themes

# Fetch the released probe binary, as consumers do.
build-probe:
    nix build .#appearance

# Compile the probe locally instead of downloading it.
build-probe-source:
    nix build .#appearance-source

flake-check:
    nix flake check

# --- release -----------------------------------------------------------------

changeset:
    pnpm changeset
