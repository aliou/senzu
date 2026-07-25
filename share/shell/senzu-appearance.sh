#!/bin/sh
# senzu-appearance.sh — print the terminal's current appearance ("dark"/"light").
#
# This is a hand-maintained support script (NOT a generator output) shipped in
# share/ so the themes package exposes it at share/shell/senzu-appearance.sh.
# It is sourced by the senzu home-manager module and by caten to drive
# dark/light variant selection for programs with no native appearance
# switching (bat, fzf). It defines `senzu_appearance`, which prints "dark" or
# "light" and returns 0.
#
# Detection order:
#   1. SENZU_APPEARANCE (or legacy CATEN_APPEARANCE) env override
#   2. OSC 11 background-color query (Ghostty and other modern terminals);
#      background luminance decides dark/light. Timeout-protected.
#   3. macOS `defaults read -g AppleInterfaceStyle`
#   4. Linux `gsettings ... color-scheme`
#   5. default: light
#
# The OSC 11 query uses `read -t`/`-d`, which are zsh/bash extensions. When
# sourced into zsh (the only current consumer) it works fully; under a bare
# POSIX /bin/sh the OSC step degrades gracefully (read fails, falls through to
# the OS fallbacks).

senzu_appearance() {
  # 1. explicit override
  _sa_ov="${SENZU_APPEARANCE:-${CATEN_APPEARANCE:-}}"
  case "$_sa_ov" in
    dark|light) printf '%s' "$_sa_ov"; return 0 ;;
  esac

  # 2. OSC 11 background query (needs a readable controlling tty)
  if [ -c /dev/tty ]; then
    _sa_res="$(_senzu_osc11_bg 2>/dev/null)" && [ -n "$_sa_res" ] && {
      printf '%s' "$_sa_res"
      return 0
    }
  fi

  # 3. macOS
  if command -v defaults >/dev/null 2>&1 &&
     [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ]; then
    printf dark
    return 0
  fi

  # 4. Linux gsettings
  if command -v gsettings >/dev/null 2>&1; then
    case "$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null)" in
      *dark*) printf dark; return 0 ;;
      *light*) printf light; return 0 ;;
    esac
  fi

  # 5. default
  printf light
  return 0
}

# Print the variant name for the current appearance, given a dark and light
# candidate (in that order). Defaults to the light candidate unless
# senzu_appearance explicitly prints "dark". Used by per-tool wrappers/hooks
# (bat, fzf) so the dark/light -> variant mapping lives in one place.
senzu_variant() {
  case "$(senzu_appearance)" in
    dark) printf '%s' "$1" ;;
    *) printf '%s' "$2" ;;
  esac
}

# Query the terminal background via OSC 11 and print "dark"/"light" from its
# luminance. Returns nonzero (prints nothing) if the terminal doesn't reply.
# Reply shapes handled (Ghostty defaults to 16-bit, ST-terminated):
#   \e]11;rgb:RRRR/GGGG/BBBB\e\\   (16-bit, ST)
#   \e]11;rgb:RR/GG/BB\e\\          (8-bit, ST)
#   \e]11;rgb:RR/GG/BB\a            (BEL-terminated)
_senzu_osc11_bg() {
  _sa_reply=""
  # Send the query straight to the tty so it works even when stdout is piped.
  printf '\033]11;?\033\\' >/dev/tty 2>/dev/null || return 1
  # Consume up to the leading ESC of the reply (reads nothing, eats the ESC).
  # Time out + return if the terminal doesn't speak OSC 11.
  IFS= read -r -t 0.1 -d $'\033' _sa_discard </dev/tty 2>/dev/null || return 1
  # Read until the ST backslash; on BEL-terminated replies this times out and
  # leaves the BEL inside _sa_reply, which the parser strips below.
  IFS= read -r -t 0.1 -d $'\\' _sa_reply </dev/tty 2>/dev/null || true
  case "$_sa_reply" in
    *"]11;rgb:"*) ;;
    *) return 1 ;;
  esac
  # Drop the "]11;rgb:" prefix and any trailing terminator bytes (ESC/BEL/etc.).
  _sa_rgb="${_sa_reply#]11;rgb:}"
  _sa_rgb="${_sa_rgb%%[!0-9A-Fa-f/]*}"
  _sa_r="${_sa_rgb%%/*}"
  _sa_rest="${_sa_rgb#*/}"
  _sa_g="${_sa_rest%%/*}"
  _sa_b="${_sa_rest#*/}"
  # Normalize 16-bit (4 hex digits) down to 8-bit by keeping the high byte.
  [ ${#_sa_r} -gt 2 ] && _sa_r="${_sa_r%"${_sa_r#??}"}"
  [ ${#_sa_g} -gt 2 ] && _sa_g="${_sa_g%"${_sa_g#??}"}"
  [ ${#_sa_b} -gt 2 ] && _sa_b="${_sa_b%"${_sa_b#??}"}"
  case "$_sa_r$_sa_g$_sa_b" in
    *[!0-9A-Fa-f]*) return 1 ;;
  esac
  [ ${#_sa_r} -eq 0 ] && _sa_r=0
  [ ${#_sa_g} -eq 0 ] && _sa_g=0
  [ ${#_sa_b} -eq 0 ] && _sa_b=0
  _sa_r=$(( 16#$_sa_r ))
  _sa_g=$(( 16#$_sa_g ))
  _sa_b=$(( 16#$_sa_b ))
  # BT.601 luminance on 0-255; below the midpoint is dark.
  _sa_lum=$(( (299 * _sa_r + 587 * _sa_g + 114 * _sa_b) / 1000 ))
  if [ "$_sa_lum" -lt 128 ]; then
    printf dark
  else
    printf light
  fi
  return 0
}

# When executed (not sourced), print the variant for the current appearance.
# Usage: senzu-appearance.sh <dark-variant> <light-variant>
# With no args, prints "dark"/"light".
#
# Running this as a subprocess (e.g. "$(senzu-appearance.sh senzu senzu-light)")
# is the leak-safe way to query OSC 11 from a shell hook: the subprocess is the
# sole reader of /dev/tty (the parent shell's line editor is blocked waiting
# for the command substitution), so the terminal's reply cannot be grabbed
# and rendered as garbage by ZLE. We also disable echo on /dev/tty during the
# query so any stray bytes are never echoed.
if [ "${0##*/}" = "senzu-appearance.sh" ]; then
  if [ -c /dev/tty ]; then
    _sa_saved=$(stty -g </dev/tty 2>/dev/null) &&
      stty -echo -icanon min 0 </dev/tty 2>/dev/null
  fi
  if [ $# -ge 2 ]; then
    senzu_variant "$1" "$2"
  else
    senzu_appearance
  fi
  _sa_rc=$?
  [ -n "${_sa_saved:-}" ] && stty "$_sa_saved" </dev/tty 2>/dev/null
  exit $_sa_rc
fi
