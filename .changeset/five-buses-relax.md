---
"@senzu/cli": patch
---

Fix dark, low-contrast colors bleeding into light variants. The pi theme's tool-call running background fell back to a hardcoded near-black when a palette had no `mine_shaft` color, affecting `senzu-light`, `senzu-muted-light`, `senzu-cold-light`, and `senzu-warm-light`. The Zed theme's git-status colors (conflict, created, deleted, hidden, ignored, predictive, renamed, unreachable) were also copied unchanged from the dark variants into all light variants, producing unreadable dark-on-light text and backgrounds.
