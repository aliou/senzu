---
"@senzu/cli": minor
---

Herdr themes now auto-switch with the terminal's appearance. Each Senzu family (e.g. `senzu`/`senzu-light`) generates one paired config with `auto_switch = true` and `[theme.custom.dark]`/`[theme.custom.light]` override tables, instead of a single flat `[theme.custom]` table per variant. `senzu install herdr <variant>` now installs both halves of the family. Installing a variant with no light/dark counterpart now fails with an explicit error instead of silently degrading to a single-appearance theme.
