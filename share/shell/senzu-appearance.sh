#!/bin/sh
# senzu-appearance.sh — compatibility shim around the senzu-appearance binary.
#
# History: this script used to query the terminal itself with OSC 11. Every
# caller (bat, delta, fzf wrappers) ran it per invocation, so N processes
# fought over one tty. Without `stty -echo` the terminal echoed the reply as
# garbage; with it, concurrent stty calls destabilized the terminal. Both
# symptoms had the same cause. See docs/appearance-detection.md.
#
# The tty query now lives in the `senzu-appearance` binary, which takes a lock,
# disables echo for the few milliseconds the reply is in flight, and restores
# the terminal on every exit path. This shim never touches the tty on its own:
# it delegates to that binary when it is available, and otherwise answers from
# the environment, the cache, or the OS preference.
#
# Sourced: defines senzu_appearance and senzu_variant.
# Executed: senzu-appearance.sh [DARK_VARIANT LIGHT_VARIANT]

# Path to the binary; falls back to whatever is on PATH.
: "${SENZU_APPEARANCE_BIN:=senzu-appearance}"

_senzu_cache_file() {
  if [ -n "${SENZU_APPEARANCE_CACHE:-}" ]; then
    printf '%s' "$SENZU_APPEARANCE_CACHE"
    return 0
  fi
  _sa_dir="${XDG_RUNTIME_DIR:-/tmp/senzu-$(id -u)}"
  [ -n "${XDG_RUNTIME_DIR:-}" ] && _sa_dir="$XDG_RUNTIME_DIR/senzu"
  _sa_tty="$(tty 2>/dev/null || echo notty)"
  printf '%s/appearance-%s' "$_sa_dir" "$(printf '%s' "${_sa_tty#/}" | tr '/' '-')"
}

# Prints "dark" or "light". Never writes to the terminal.
senzu_appearance() {
  # 1. explicit override
  case "${SENZU_APPEARANCE:-}" in
    dark|light) printf '%s' "$SENZU_APPEARANCE"; return 0 ;;
  esac

  # 2. the binary, which owns the tty query. --max-age bounds how often a
  # legacy per-invocation caller can reach the terminal: without it, a tool
  # wrapper in a loop would probe on every call, which is what this rewrite
  # exists to stop. Callers that must never touch the tty should set
  # SENZU_APPEARANCE or read the cache directly.
  if command -v "$SENZU_APPEARANCE_BIN" >/dev/null 2>&1; then
    _sa_out="$("$SENZU_APPEARANCE_BIN" --max-age "${SENZU_APPEARANCE_MAX_AGE_MS:-3000}" 2>/dev/null)"
    case "$_sa_out" in
      dark|light) printf '%s' "$_sa_out"; return 0 ;;
    esac
  fi

  # 3. cached answer from this terminal, at any age
  _sa_cache="$(_senzu_cache_file)"
  if [ -r "$_sa_cache" ]; then
    read -r _sa_cached < "$_sa_cache"
    case "$_sa_cached" in
      dark|light) printf '%s' "$_sa_cached"; return 0 ;;
    esac
  fi

  # 4. OS preference: not the terminal's background, but better than a guess
  if command -v defaults >/dev/null 2>&1 &&
     [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ]; then
    printf dark
    return 0
  fi
  if command -v gsettings >/dev/null 2>&1; then
    case "$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null)" in
      *dark*) printf dark; return 0 ;;
      *light*) printf light; return 0 ;;
    esac
  fi

  # 5. default
  printf dark
  return 0
}

# Map the current appearance onto a dark/light variant pair.
senzu_variant() {
  case "$(senzu_appearance)" in
    dark) printf '%s' "$1" ;;
    *) printf '%s' "$2" ;;
  esac
}

if [ "${0##*/}" = "senzu-appearance.sh" ]; then
  if [ $# -ge 2 ]; then
    senzu_variant "$1" "$2"
  else
    senzu_appearance
  fi
  exit $?
fi
