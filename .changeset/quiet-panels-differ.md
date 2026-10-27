---
"@senzu/cli": patch
---

Separate the pi theme's user-message and tool panels by hue. `toolSuccessBg` now takes the success hue (green) while `userMessageBg` keeps its original neutral grey, and `customMessageBg` is tinted violet where the palette has a chromatic magenta. All panels keep the OKLCH lightness of the slot they replaced, so text contrast is unchanged. A user message and a finished tool call were previously two near-identical greys, which made them indistinguishable while scrolling.
