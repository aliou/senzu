#!/usr/bin/env zsh
# senzu-hook.zsh — keep terminal-driven tools on the right Senzu variant.
#
# This is the ONLY place allowed to query the terminal. Tools that run per
# keystroke (fzf) or per pipeline (bat, delta) must never probe: they read the
# variant from the environment this hook exports. See
# docs/appearance-detection.md for why.
#
# Usage in .zshrc:
#
#   export SENZU_SHARE_DIR=/path/to/senzu-themes/share   # for the fzf snippet
#   source /path/to/senzu-hook.zsh senzu senzu-light
#
# Exports, refreshed at the prompt when the appearance changes:
#
#   SENZU_APPEARANCE   dark | light
#   SENZU_VARIANT      the matching variant name
#   BAT_THEME          same variant (bat and delta both read this)
#   DELTA_FEATURES     +senzu-dark | +senzu-light
#   FZF_DEFAULT_OPTS   base options plus the variant's --color spec
#
# Manual override: set SENZU_APPEARANCE=dark|light yourself and the hook stops
# probing until you unset it. `senzu-refresh` forces an immediate re-probe.

[[ -o interactive ]] || return 0

typeset -g SENZU_DARK_VARIANT="${1:-${SENZU_DARK_VARIANT:-senzu}}"
typeset -g SENZU_LIGHT_VARIANT="${2:-${SENZU_LIGHT_VARIANT:-senzu-light}}"
# Probe at most this often. The probe costs a few ms; between refreshes the
# prompt does nothing but compare two strings.
typeset -g SENZU_REFRESH_MS="${SENZU_REFRESH_MS:-3000}"
typeset -g SENZU_APPEARANCE_BIN="${SENZU_APPEARANCE_BIN:-senzu-appearance}"

typeset -g _senzu_last_appearance=""
typeset -g _senzu_exported_appearance=""
typeset -g _senzu_override=""
typeset -g _senzu_last_probe_ms=0
typeset -g _senzu_fzf_base="${FZF_DEFAULT_OPTS:-}"

# Where the per-variant fzf color snippets live. Defaults to the share/ dir
# this hook ships in; consumers may override before sourcing.
typeset -g SENZU_SHARE_DIR="${SENZU_SHARE_DIR:-${${(%):-%x}:A:h:h}}"

zmodload -F zsh/datetime b:strftime 2>/dev/null

_senzu_now_ms() {
  if (( ${+EPOCHREALTIME} )); then
    printf '%d' $(( EPOCHREALTIME * 1000 ))
  else
    printf '%d' $(( $(date +%s) * 1000 ))
  fi
}

# Apply the variant to every tool that cannot detect the appearance itself.
_senzu_apply() {
  local appearance="$1" variant

  if [[ "$appearance" == dark ]]; then
    variant="$SENZU_DARK_VARIANT"
  else
    variant="$SENZU_LIGHT_VARIANT"
  fi

  export SENZU_APPEARANCE="$appearance"
  export SENZU_VARIANT="$variant"

  # bat reads BAT_THEME; delta falls back to it for --syntax-theme.
  export BAT_THEME="$variant"

  # delta features defined in gitconfig, e.g.
  #   [delta "senzu-dark"]  dark = true;  syntax-theme = senzu
  #   [delta "senzu-light"] light = true; syntax-theme = senzu-light
  export DELTA_FEATURES="+senzu-${appearance}"

  # fzf has no theme file: re-apply the base options plus this variant's spec.
  local snippet="${SENZU_SHARE_DIR}/fzf/${variant}.sh"
  if [[ -f "$snippet" ]]; then
    FZF_DEFAULT_OPTS="$_senzu_fzf_base"
    source "$snippet"
  fi

  _senzu_last_appearance="$appearance"
  # Remember what we exported so a value we did not set reads as an override.
  _senzu_exported_appearance="$appearance"
}

# Probe unless something cheaper already knows the answer.
_senzu_precmd() {
  local current="${SENZU_APPEARANCE:-}"

  # A value we did not export is a manual override. It holds until the user
  # unsets SENZU_APPEARANCE; probing would silently overwrite it.
  if [[ -n "$current" && "$current" != "$_senzu_exported_appearance" ]]; then
    case "$current" in
      dark|light)
        _senzu_override=1
        _senzu_apply "$current"
        return 0
        ;;
    esac
  fi
  if [[ -z "$current" ]]; then
    _senzu_override=""
  elif [[ -n "$_senzu_override" ]]; then
    return 0
  fi

  local now=$(_senzu_now_ms)
  (( now - _senzu_last_probe_ms < SENZU_REFRESH_MS )) && return 0
  _senzu_last_probe_ms=$now

  # SENZU_APPEARANCE is cleared for the call so our own export does not
  # short-circuit detection inside the probe.
  local appearance
  appearance=$(SENZU_APPEARANCE= "$SENZU_APPEARANCE_BIN" --default dark 2>/dev/null) || return 0
  [[ -n "$appearance" && "$appearance" != "$_senzu_last_appearance" ]] || return 0
  _senzu_apply "$appearance"
}

# Force an immediate re-probe, ignoring the throttle, the cache and any
# override left over from a previous prompt.
senzu-refresh() {
  local appearance
  _senzu_override=""
  appearance=$(SENZU_APPEARANCE= "$SENZU_APPEARANCE_BIN" --max-age 0 --default dark 2>/dev/null)
  case "$appearance" in
    dark|light) ;;
    *) return 1 ;;
  esac
  _senzu_last_probe_ms=$(_senzu_now_ms)
  _senzu_apply "$appearance"
  print -r -- "senzu: $appearance ($SENZU_VARIANT)"
}

autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd _senzu_precmd

# Apply once at startup so the first command is themed.
_senzu_precmd
