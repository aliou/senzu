---
"@senzu/cli": patch
---

Herdr themes now base on the built-in `"terminal"` theme instead of `"catppuccin"`/`"catppuccin-latte"`, and cover two previously-missing tokens: `active_row_bg` and `selection_bg`. Both fell back to Catppuccin's fixed colors before, so every Senzu-themed Herdr install showed the same blue-tinted active-row and selection highlight regardless of variant. Regenerated all 12 `share/herdr/*.toml` files.
