# senzu-appearance

Reports the terminal's current appearance (dark/light) by asking for its
background with OSC 11. The only component allowed to touch the tty; see
[docs/appearance-detection.md](../docs/appearance-detection.md) for why that
matters and what everything else does instead.

## Layout

| File | Concern |
| --- | --- |
| `src/appearance.rs` | The value, plus the env and OS fallbacks |
| `src/osc.rs` | OSC 11 wire format. Pure, so most tests live here |
| `src/probe.rs` | The tty query: lock, echo off, restore |
| `src/cache.rs` | Per-terminal answer cache and its lock path |
| `src/cli.rs` | Option parsing |
| `src/detect.rs` | Which source wins |
| `src/main.rs` | Wiring and output |
| `tests/cli.rs` | End-to-end against the built binary |
| `tests/pty.rs` | Against a real terminal |

## Build and test

```sh
just test-native          # 58 tests: 44 unit, 7 CLI, 7 pty
just build-native
just clippy
just probe "senzu senzu-light"
```

The pty tests fork a terminal and answer OSC 11 from the master side, covering
what unit tests cannot: the reply is never echoed, the terminal is restored
exactly as found, typeahead is left alone, and `--cached-only` never reaches
the tty. They caught a real bug during development — the probe used to `flock`
`/dev/tty`, a single device node shared by every process, so probes in
unrelated terminals serialized against each other.

## Usage

```sh
senzu-appearance                      # dark | light
senzu-appearance senzu senzu-light    # variant name for the current appearance
senzu-appearance --cached-only        # never touches the tty
senzu-appearance --max-age 3000       # reuse an answer younger than 3s
```

## Distribution

The release workflow builds this for `aarch64-darwin`, `aarch64-linux` and
`x86_64-linux`, attaches the binaries to the GitHub release, and rewrites the
version and hashes in `flake.nix`. Consumers download; nobody compiles it on
their own machine.

Linux targets are `*-unknown-linux-musl`, so the binaries are static: no
interpreter to patch, and they run on NixOS unchanged.

```sh
nix build .#appearance          # the released binary
nix build .#appearance-source   # compile locally instead
```

`.#appearance` falls back to a source build while the hashes in `flake.nix`
are still placeholders, which is the case before the first release that
includes binaries.

The version in `Cargo.toml` must match the release version, since the binary
is published under the release tag. CI enforces it; `just sync-version` fixes
it.
