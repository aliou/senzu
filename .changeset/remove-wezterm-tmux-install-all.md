---
"@senzu/cli": minor
---

Remove the wezterm and tmux generators and targets, and rewrite the home-manager module to install everything it finds in the generated `share/` tree instead of maintaining a hardcoded variant list. Per-target `enable` and `variants` options are gone; `programs.senzu.enable`, the appearance options, and the `darkVariant`/`lightVariant` pair remain. New variants now install automatically.
