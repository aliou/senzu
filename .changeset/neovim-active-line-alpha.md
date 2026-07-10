---
"@senzu/cli": patch
---

Fix invalid highlight color in neovim colorscheme. The active line background
slot uses an alpha hex (`#rrggbbaa`) which is valid in Zed but rejected by
Neovim's `nvim_set_hl` with `E5113: Invalid highlight color`. The neovim
generator now composites the alpha over the palette background, producing
opaque `#rrggbb` values.
