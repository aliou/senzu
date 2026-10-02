---
"@senzu/cli": patch
---

`senzu-appearance` no longer eats keystrokes. The typeahead check now runs after canonical mode is off, so it also sees a half-typed command, such as one typed into a shell that is still starting. Keys typed while the OSC 11 reply is in flight are pushed back into the terminal's input with `TIOCSTI`, except on Linux kernels that disable it.
