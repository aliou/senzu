# Appearance detection

Some tools have no theme file and no way to follow the terminal: `fzf` takes
colors as command-line flags, `delta` takes a syntax theme name, `bat` takes a
theme name. To pick a Senzu variant for them, something has to know whether the
terminal is currently dark or light.

## The signal is the terminal background, not the OS

The terminal may be pinned to a dark theme on a light system, pinned to a light
theme on a dark system, or set to `dark:senzu,light:senzu-light` and follow the
OS. Tools must match the terminal in all three cases, so the OS preference is
not usable as the primary signal.

That rules out DEC mode 2031 / `CSI ? 996 n` as well, tempting as it looks:
Ghostty answers it with the *system* color preference, not the terminal
background ([ghostty#2771](https://github.com/ghostty-org/ghostty/pull/2771)).
It stays useful as a change notification, not as the answer.

The signal is OSC 11: ask the terminal for its background color and take the
luminance. The OS preference is only a last-resort fallback for terminals that
do not answer.

## One process may query the tty

The first implementation had every tool query on every invocation, through
wrappers around `bat`, `fzf` and `delta`. That does not work, for two reasons
that look like different bugs but are the same one:

- The terminal's reply arrives as *input*. Unless echo is off while it is in
  flight, the terminal prints it: `^[]11;rgb:1515/1515/1515^[\` in the middle
  of your output.
- Turning echo off means mutating shared terminal state. With `fzf` probing per
  keystroke, `bat` per pipeline and `delta` under a pager, several short-lived
  processes save and restore that state concurrently and can restore each
  other's stale settings.

So the rule is:

> Exactly one process may query the tty. Everyone else reads a cached answer.

That process is the interactive shell, at prompt time, through the
`senzu-appearance` binary. Tools never probe; they read the variant from the
environment the shell exports.

## Components

| Component | Role |
| --- | --- |
| `senzu-appearance` (`native/`) | Queries the tty safely. Takes a per-terminal lock, disables echo, restores on every exit path, caches the answer per tty. Shipped as a prebuilt binary from the release workflow. |
| `share/shell/senzu-hook.zsh` | The one caller allowed to probe. Throttled `precmd` hook; exports `SENZU_APPEARANCE`, `SENZU_VARIANT`, `BAT_THEME`, `DELTA_FEATURES`, `FZF_DEFAULT_OPTS`. |
| `share/shell/senzu-appearance.sh` | Compatibility shim for anything still calling the old script. Never touches the tty itself. |

### What the binary does

1. `$SENZU_APPEARANCE` override, if set.
2. Cached answer for this tty, if younger than `--max-age`.
3. OSC 11 probe:
   - `flock` on a per-terminal lock file next to the cache entry, so concurrent
     probes on the same terminal serialize. Not on `/dev/tty`: that is one
     device node shared by every process, so locking it would make unrelated
     terminals wait on each other.
   - Skip entirely if `FIONREAD` reports pending input: probing would eat the
     user's keystrokes.
   - `ECHO` and `ICANON` off, `VMIN=0` `VTIME=1`. Not `VMIN=0`/`VTIME=0` with
     `poll()`: on macOS a never-blocking read makes `poll()` report `POLLIN`
     unconditionally, which turns the wait into a busy spin.
   - Restore with `TCSANOW` (never `TCSAFLUSH`, which would discard typeahead),
     from a `Drop` guard or `atexit`, and from handlers for `SIGINT`,
     `SIGTERM`, `SIGHUP`, `SIGQUIT`, `SIGPIPE`.
   - Inside tmux, wrap the query in a passthrough so the outer terminal answers
     instead of tmux's cached background. Requires `allow-passthrough on`.
4. Stale cache: it came from this terminal, so it beats the OS.
5. OS preference (`AppleInterfaceStyle`, `gsettings`).
6. `--default`, which is `dark`.

### What the tools do

None of them query:

```gitconfig
[delta "senzu-dark"]  dark = true;  syntax-theme = senzu
[delta "senzu-light"] light = true; syntax-theme = senzu-light
[delta] detect-dark-light = never
```

- **bat** reads `BAT_THEME`. Do not leave it on `--theme=auto`, or bat runs its
  own query in parallel with the hook.
- **delta** reads `DELTA_FEATURES` and falls back to `BAT_THEME` for
  `--syntax-theme`. `detect-dark-light = never` stops delta's own OSC 10/11
  query, which its documentation warns races with pagers such as `less`.
- **fzf** gets `FZF_DEFAULT_OPTS` rebuilt from a captured base plus the
  variant's `--color` snippet.

## Cost

- Prompt with no change: two string comparisons.
- Prompt past the throttle (`SENZU_REFRESH_MS`, default 3000): one exec of the
  probe, a few milliseconds, most of it the terminal's round trip.
- Terminal that never answers: bounded by `--timeout` (default 150 ms), then
  cached so the next prompts are free.
- A tool started before a switch keeps its colors until it is restarted. Nvim
  handles mode 2031 itself; lazygit does not.

## Getting the binary

The release workflow builds `senzu-appearance` for the three supported systems
and attaches it to the GitHub release, then points `flake.nix` at it. Home
manager installs the download, so updating the senzu input does not trigger a
Rust build on every machine. `nix build .#appearance-source` compiles it
locally when needed.

## Tests

`just test-native` runs 58 tests. The ones that matter for the bugs above are
in `native/rust/tests/pty.rs`: they fork a real terminal, answer OSC 11 from
the master side, and assert that the reply is never echoed, that `echo` and
`icanon` come back exactly as they were, that a probe is skipped when the user
has typed ahead, and that `--cached-only` never reaches the tty.
