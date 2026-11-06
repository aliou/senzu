import type { Palette } from "../core/types";
import { PiGenerator } from "../generators/pi";
import { SAMPLES, type Sample, type Span } from "./samples";

/* ------------------------------------------------------------------ *
 * Preview
 *
 * Re-themes the whole terminal for the selected palette: the terminal's
 * default background / foreground / cursor and the 16-color ANSI palette
 * are changed via OSC sequences, the screen is cleared so the new
 * background fills the window, and themed content is rendered on top.
 *
 * On exit the original colors are restored with the matching OSC reset
 * sequences (110/111/112/104) — no terminal querying required.
 * ------------------------------------------------------------------ */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENTER_ALT = "\x1b[?1049h";
const LEAVE_ALT = "\x1b[?1049l";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";
const ST = "\x1b\\"; // OSC string terminator

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").slice(0, 6);
  const num = Number.parseInt(clean, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/** XParseColor spec: rgb:RR/GG/BB (2-digit uppercase). */
function oscSpec(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `rgb:${h(r)}/${h(g)}/${h(b)}`;
}

/** Set terminal default foreground (OSC 10). */
function setFg(hex: string): string {
  return `\x1b]10;${oscSpec(hex)}${ST}`;
}
/** Set terminal default background (OSC 11). */
function setBg(hex: string): string {
  return `\x1b]11;${oscSpec(hex)}${ST}`;
}
/** Set terminal cursor color (OSC 12). */
function setCursor(hex: string): string {
  return `\x1b]12;${oscSpec(hex)}${ST}`;
}
/** Set a single ANSI palette slot (OSC 4 ; n ; spec). */
function setPalette(n: number, hex: string): string {
  return `\x1b]4;${n};${oscSpec(hex)}${ST}`;
}

/** Truecolor foreground run. */
function fg(hex: string, text: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

/** Truecolor foreground+background run. */
function fb(fgHex: string, bgHex: string, text: string): string {
  const [fr, fg2, fb2] = hexToRgb(fgHex);
  const [br, bg2, bb2] = hexToRgb(bgHex);
  return `\x1b[38;2;${fr};${fg2};${fb2};48;2;${br};${bg2};${bb2}m${text}${RESET}`;
}

/** Muted run: dim the palette's foreground for labels/footers. */
function muted(p: Palette, text: string): string {
  return `${DIM}${fg(p.foreground, text)}${RESET}`;
}

/** Readable text color (black/white) for a given background. */
function readableFg(bgHex: string): string {
  const [r, g, b] = hexToRgb(bgHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

/** Flatten an 8-digit #rrggbbaa hex onto an opaque background. */
function flattenAlpha(hex: string, over: string): string {
  if (hex.length !== 9) return hex;
  const a = Number.parseInt(hex.slice(7, 9), 16) / 255;
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(over);
  const mix = (x: number, y: number) => Math.round(y + (x - y) * a);
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(mix(r1, r2))}${h(mix(g1, g2))}${h(mix(b1, b2))}`;
}

/* ------------------------------------------------------------------ *
 * Apply / restore terminal theme
 * ------------------------------------------------------------------ */

function applyTerminalTheme(p: Palette): void {
  // Default fg/bg/cursor.
  let out = setFg(p.foreground) + setBg(p.background) + setCursor(p.cursor);
  // 16-color ANSI palette.
  const a = p.ansi;
  const b = p.ansi_bright;
  const slots: Array<[number, string]> = [
    [0, a.black],
    [1, a.red],
    [2, a.green],
    [3, a.yellow],
    [4, a.blue],
    [5, a.magenta],
    [6, a.cyan],
    [7, a.white],
    [8, b.black],
    [9, b.red],
    [10, b.green],
    [11, b.yellow],
    [12, b.blue],
    [13, b.magenta],
    [14, b.cyan],
    [15, b.white],
  ];
  for (const [n, hex] of slots) out += setPalette(n, hex);
  out += CLEAR_SCREEN;
  process.stdout.write(out);
}

function restoreTerminalTheme(): void {
  // Reset default fg/bg/cursor and the whole ANSI palette to the
  // terminal's configured defaults. Supported by xterm, Ghostty, etc.
  const out =
    `\x1b]110${ST}` + // reset default fg
    `\x1b]111${ST}` + // reset default bg
    `\x1b]112${ST}` + // reset cursor color
    `\x1b]104${ST}` + // reset all palette colors
    CLEAR_SCREEN;
  process.stdout.write(out);
}

/* ------------------------------------------------------------------ *
 * Rendering (themed content over the themed background)
 * ------------------------------------------------------------------ */

function write(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function section(title: string): void {
  write();
  write(`  ${BOLD}${DIM}${title}${RESET}`);
  write();
}

/** Map a syntax role to a palette color, falling back to foreground. */
function roleColor(p: Palette, role: Span[0]): string {
  const key = role as keyof typeof p.syntax;
  return p.syntax[key] ?? p.foreground;
}

/** Ghostty-style ANSI grid: right-aligned index + color blocks,
 * 8 per row (2 rows) when wide, 4 per row (4 rows) when narrow. */
function renderAnsiGrid(p: Palette): void {
  const colors = [
    p.ansi.black,
    p.ansi.red,
    p.ansi.green,
    p.ansi.yellow,
    p.ansi.blue,
    p.ansi.magenta,
    p.ansi.cyan,
    p.ansi.white,
    p.ansi_bright.black,
    p.ansi_bright.red,
    p.ansi_bright.green,
    p.ansi_bright.yellow,
    p.ansi_bright.blue,
    p.ansi_bright.magenta,
    p.ansi_bright.cyan,
    p.ansi_bright.white,
  ];
  const termWidth = process.stdout.columns || 80;
  const cellW = 2 + 1 + 3 + 2; // index + space + blocks + gap
  const cols = termWidth >= cellW * 8 + 2 ? 8 : 4;
  for (let start = 0; start < colors.length; start += cols) {
    let line = "";
    for (let i = start; i < Math.min(start + cols, colors.length); i++) {
      const hex = colors[i];
      if (!hex) continue;
      line += `${fg(p.foreground, String(i).padStart(2))} ${fg(hex, "███")}  `;
    }
    write(`  ${line.trimEnd()}`);
  }
}

/* Editor surface mockup: a miniature editor window drawn with the
 * palette's ui.* colors so each surface is visible in context. */

interface Seg {
  text: string;
  fgHex: string;
  bgHex: string;
  bold?: boolean;
  /** Spacer segments expand to fill the remaining row width. */
  spacer?: boolean;
}

/** Join segments into a row of exactly `width` cells; a spacer segment
 * absorbs the leftover width so trailing segments stay right-aligned. */
function composeRow(segs: Seg[], width: number): string {
  const used = segs.reduce((n, s) => (s.spacer ? n : n + s.text.length), 0);
  return segs
    .map((s) =>
      fb(
        s.fgHex,
        s.bgHex,
        `${s.bold ? BOLD : ""}${s.spacer ? " ".repeat(Math.max(0, width - used)) : s.text}`,
      ),
    )
    .join("");
}

/** Render a miniature editor window: chrome from the palette's ui.*
 * colors around the real, syntax-highlighted code sample. */
function renderSurfaceMock(p: Palette, sample: Sample): void {
  const bg = p.background;
  const at = (key: string, fallback: string): string => {
    const v = p.ui[key];
    return flattenAlpha(typeof v === "string" ? v : fallback, bg);
  };
  const surface = at("surface.background", bg);
  const titleBg = at("title_bar.background", surface);
  const statusBg = at("status_bar.background", surface);
  const gutterBg = at("editor.gutter.background", surface);
  const activeBg = at("editor.active_line.background", surface);
  const border = at("border", gutterBg);
  const gutterFg = at("editor.line_number", "#888888");
  const activeNumFg = at("editor.active_line_number", p.foreground);
  const codeFg = at("editor.foreground", p.foreground);

  // Scale to the terminal so most sample lines fit unclipped.
  const termWidth = process.stdout.columns || 80;
  const W = Math.min(Math.max(termWidth - 4, 46), 96);
  const inner = W - 2;
  const numW = String(sample.lines.length).length;
  const bodyW = inner - (numW + 2) - 1;
  const frame = (l: string, mid: string, r: string) =>
    `  ${fg(border, l + mid.repeat(inner) + r)}`;

  write(frame("┌", "─", "┐"));

  // Title bar: file path left, traffic lights right.
  write(
    `  ${fg(border, "│")}${composeRow(
      [
        { text: ` ${sample.path}`, fgHex: readableFg(titleBg), bgHex: titleBg },
        { text: "", fgHex: readableFg(titleBg), bgHex: titleBg, spacer: true },
        { text: " ●", fgHex: p.ansi.red, bgHex: titleBg },
        { text: " ●", fgHex: p.ansi.yellow, bgHex: titleBg },
        { text: " ● ", fgHex: p.ansi.green, bgHex: titleBg },
      ],
      inner,
    )}${fg(border, "│")}`,
  );
  write(frame("├", "─", "┤"));

  // Editor body: gutter + sample code, one line highlighted as active.
  const ACTIVE = 5;
  for (let i = 0; i < sample.lines.length; i++) {
    const isActive = i === ACTIVE;
    const bodyBg = isActive ? activeBg : surface;
    const segs: Seg[] = [
      {
        text: ` ${String(i + 1).padStart(numW)} `,
        fgHex: isActive ? activeNumFg : gutterFg,
        bgHex: isActive ? activeBg : gutterBg,
      },
      { text: " ", fgHex: codeFg, bgHex: bodyBg },
    ];
    const line = sample.lines[i];
    if (line) {
      let room = bodyW;
      for (const [role, text] of line) {
        if (room <= 0) break;
        const clipped =
          text.length > room ? `${text.slice(0, room - 1)}…` : text;
        room -= clipped.length;
        segs.push({ text: clipped, fgHex: roleColor(p, role), bgHex: bodyBg });
      }
    }
    segs.push({ text: "", fgHex: codeFg, bgHex: bodyBg, spacer: true });
    write(`  ${fg(border, "│")}${composeRow(segs, inner)}${fg(border, "│")}`);
  }
  write(frame("├", "─", "┤"));

  // Status bar: branch, diagnostics, cursor position on the active line.
  const statusFg = readableFg(statusBg);
  write(
    `  ${fg(border, "│")}${composeRow(
      [
        { text: " ⎇ main", fgHex: statusFg, bgHex: statusBg },
        { text: "  ✓", fgHex: p.semantic.ok, bgHex: statusBg },
        { text: " 0 problems", fgHex: statusFg, bgHex: statusBg },
        { text: "", fgHex: statusFg, bgHex: statusBg, spacer: true },
        { text: `Ln ${ACTIVE + 1}, Col 24 `, fgHex: statusFg, bgHex: statusBg },
      ],
      inner,
    )}${fg(border, "│")}`,
  );
  write(frame("└", "─", "┘"));
}

/** Which surface mock the preview shows; toggled with tab. */
export type PreviewView = "editor" | "pi";

/** Pi theme slots the preview needs, resolved to flat hexes. */
interface PiColors {
  userMessageBg: string;
  userMessageText: string;
  toolPendingBg: string;
  toolSuccessBg: string;
  toolErrorBg: string;
  toolTitle: string;
  toolOutput: string;
  toolDiffAdded: string;
  toolDiffRemoved: string;
  toolDiffContext: string;
  thinkingText: string;
  text: string;
  muted: string;
  borderMuted: string;
}

/** Resolve the generated pi theme's var references into flat hexes. */
function piColors(p: Palette): PiColors {
  const theme = JSON.parse(new PiGenerator().generate(p)) as {
    colors: Record<string, string>;
    vars: Record<string, string>;
  };
  const resolve = (slot: string): string => {
    let current: string | undefined = theme.colors[slot];
    for (
      let i = 0;
      i < 8 && current !== undefined && current in theme.vars;
      i++
    ) {
      current = theme.vars[current];
    }
    return current ?? "#000000";
  };
  return {
    userMessageBg: resolve("userMessageBg"),
    userMessageText: resolve("userMessageText"),
    toolPendingBg: resolve("toolPendingBg"),
    toolSuccessBg: resolve("toolSuccessBg"),
    toolErrorBg: resolve("toolErrorBg"),
    toolTitle: resolve("toolTitle"),
    toolOutput: resolve("toolOutput"),
    toolDiffAdded: resolve("toolDiffAdded"),
    toolDiffRemoved: resolve("toolDiffRemoved"),
    toolDiffContext: resolve("toolDiffContext"),
    thinkingText: resolve("thinkingText"),
    text: resolve("text"),
    muted: resolve("muted"),
    borderMuted: resolve("borderMuted"),
  };
}

/** Render a mock pi transcript: user message, thinking, reply, tool
 * panels in all three states (running, success, error), and the editor,
 * laid out like the real TUI — full-width background blocks. */
function renderPiPanels(p: Palette): void {
  const c = piColors(p);
  const termWidth = process.stdout.columns || 80;
  const W = Math.min(Math.max(termWidth - 2, 40), 120);
  /** A full-width strip of `bg` carrying the given segments. */
  const strip = (bg: string, segs: Seg[]): void => {
    write(
      `  ${composeRow(
        [...segs, { text: "", fgHex: p.foreground, bgHex: bg, spacer: true }],
        W,
      )}`,
    );
  };

  // User message: a full-width panel with a blank background line
  // above and below, exactly as pi pads its Markdown block.
  strip(c.userMessageBg, []);
  strip(c.userMessageBg, [
    {
      text: " swatch.ts renders dim colors with the wrong hex on dark terminals",
      fgHex: c.userMessageText,
      bgHex: c.userMessageBg,
    },
  ]);
  strip(c.userMessageBg, []);
  write();

  // Thinking: italic thinkingText on the plain background.
  write(
    `  ${ITALIC}${fg(c.thinkingText, "reading swatch.ts, checking flattenAlpha…")}${RESET}`,
  );
  write();

  // Assistant reply: plain text, no background.
  write(
    `  ${fg(c.text, "flattenAlpha premultiplies alpha into the wrong channel,")}`,
  );
  write(`  ${fg(c.text, "so dim text trades places with the foreground.")}`);
  write();

  // Tool call still running: toolPendingBg, bold call line, live timer.
  strip(c.toolPendingBg, []);
  strip(c.toolPendingBg, [
    {
      text: " $ pnpm -C packages/cli test",
      fgHex: c.toolTitle,
      bgHex: c.toolPendingBg,
      bold: true,
    },
  ]);
  strip(c.toolPendingBg, [
    {
      text: " Elapsed 3.0s",
      fgHex: c.muted,
      bgHex: c.toolPendingBg,
    },
  ]);
  strip(c.toolPendingBg, []);
  write();

  // Failed tool call: toolErrorBg, output, exit line, Took.
  strip(c.toolErrorBg, []);
  strip(c.toolErrorBg, [
    {
      text: " $ ls /definitely-missing-dir",
      fgHex: c.toolTitle,
      bgHex: c.toolErrorBg,
      bold: true,
    },
  ]);
  strip(c.toolErrorBg, []);
  strip(c.toolErrorBg, [
    {
      text: " ls: cannot access '/definitely-missing-dir': No such file or directory",
      fgHex: c.toolOutput,
      bgHex: c.toolErrorBg,
    },
  ]);
  strip(c.toolErrorBg, [
    {
      text: " Command exited with code 2",
      fgHex: c.toolOutput,
      bgHex: c.toolErrorBg,
    },
  ]);
  strip(c.toolErrorBg, [
    {
      text: " Took 0.0s",
      fgHex: c.muted,
      bgHex: c.toolErrorBg,
    },
  ]);
  strip(c.toolErrorBg, []);
  write();

  // Successful tool call: toolSuccessBg with the diff.
  strip(c.toolSuccessBg, []);
  strip(c.toolSuccessBg, [
    {
      text: " edit packages/cli/src/core/swatch.ts",
      fgHex: c.toolTitle,
      bgHex: c.toolSuccessBg,
      bold: true,
    },
  ]);
  strip(c.toolSuccessBg, [
    {
      text: " -3   return hex.slice(0, 7);",
      fgHex: c.toolDiffRemoved,
      bgHex: c.toolSuccessBg,
    },
  ]);
  strip(c.toolSuccessBg, [
    {
      text: " +3   return flattenAlpha(hex, bg);",
      fgHex: c.toolDiffAdded,
      bgHex: c.toolSuccessBg,
    },
  ]);
  strip(c.toolSuccessBg, [
    {
      text: "      const bg = palette.background;",
      fgHex: c.toolDiffContext,
      bgHex: c.toolSuccessBg,
    },
  ]);
  strip(c.toolSuccessBg, []);
  write();

  // Editor: full-width rules above and below the input line.
  const rule = fg(c.borderMuted, "─".repeat(W));
  write(`  ${rule}`);
  write(
    `  ${fg(c.text, "explain the diff")}${fb(p.cursor_text, p.cursor, " ")}`,
  );
  write(`  ${rule}`);
}

function renderPalette(p: Palette, view: PreviewView): void {
  // Header
  const accent = p.accents[0] ?? p.foreground;
  write(
    `  ${BOLD}${fg(accent, p.name)}${RESET}  ${muted(p, `(${p.appearance})`)}`,
  );

  section("ANSI 16-color");
  renderAnsiGrid(p);

  section("Semantic");
  const sem: Array<[string, string]> = [
    ["error", p.semantic.error],
    ["warning", p.semantic.warning],
    ["info", p.semantic.info],
    ["hint", p.semantic.hint],
    ["ok", p.semantic.ok],
  ];
  write(
    "  " +
      sem
        .map(([label, hex]) => fb(readableFg(hex), hex, ` ${label} `))
        .join(" "),
  );

  if (view === "pi") {
    section("Pi surface");
    renderPiPanels(p);
  } else {
    section("Editor surface");
    const sample = SAMPLES[0];
    if (sample) renderSurfaceMock(p, sample);
  }
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

export async function runPreview(
  palettes: Palette[],
  preselected?: string,
): Promise<void> {
  if (palettes.length === 0) {
    throw new Error("No palettes available to preview.");
  }

  let start = 0;
  if (preselected) {
    const found = palettes.findIndex(
      (p) => p.name.toLowerCase().replace(/\s+/g, "-") === preselected,
    );
    if (found === -1) {
      throw new Error(`No palette matching: ${preselected}`);
    }
    start = found;
  }

  // Non-interactive: render a static reference (no OSC), for piped output.
  if (!process.stdin.isTTY) {
    const first = palettes[start];
    if (first) staticRender(first);
    return;
  }

  await interactiveLoop(palettes, start);
}

/** Static, no-OSC render: prints themed swatches for piping. */
function staticRender(p: Palette): void {
  const out: string[] = [];
  out.push(`${BOLD}${p.name}${RESET}  ${DIM}(${p.appearance})${RESET}`);
  out.push("");
  out.push("ANSI:");
  const all: Array<[string, string]> = [
    ["black", p.ansi.black],
    ["red", p.ansi.red],
    ["green", p.ansi.green],
    ["yellow", p.ansi.yellow],
    ["blue", p.ansi.blue],
    ["magenta", p.ansi.magenta],
    ["cyan", p.ansi.cyan],
    ["white", p.ansi.white],
    ["bright black", p.ansi_bright.black],
    ["bright white", p.ansi_bright.white],
  ];
  for (const [label, hex] of all) {
    out.push(`  ${fb(readableFg(hex), hex, "      ")} ${hex} ${label}`);
  }
  process.stdout.write(`${out.join("\n")}\n`);
}

function keyPress(buf: Buffer): string {
  const s = buf.toString("utf8");
  if (s === "\r" || s === "\n") return "enter";
  if (s === "q" || s === "\x1b" || s === "\x03") return "quit";
  if (s === "\t") return "view";
  if (s === "\x1b[A" || s === "k") return "up";
  if (s === "\x1b[B" || s === "j") return "down";
  return "";
}

/** Palette switcher: a grid of names, active one inverted. */
function renderFooter(palettes: Palette[], index: number): void {
  const termWidth = process.stdout.columns || 80;
  const nameW = Math.max(...palettes.map((p) => p.name.length));
  const cellW = nameW + 3; // " name " + gap
  const perRow = Math.max(1, Math.min(4, Math.floor((termWidth - 2) / cellW)));

  for (let start = 0; start < palettes.length; start += perRow) {
    const parts: string[] = [];
    for (let i = start; i < Math.min(start + perRow, palettes.length); i++) {
      const p = palettes[i];
      if (!p) continue;
      const label = ` ${p.name.padEnd(nameW)} `;
      if (i === index) {
        parts.push(
          `${BOLD}${fb(readableFg(p.cursor), p.cursor, label)}${RESET}`,
        );
      } else {
        parts.push(
          `${DIM} ${RESET}${fg(p.foreground, p.name.padEnd(nameW))}${DIM} ${RESET}`,
        );
      }
    }
    write(`  ${parts.join("  ")}`);
  }
  write();
  write(`  ${DIM}↑/↓ switch · tab toggle view · q quit${RESET}`);
}

function interactiveLoop(palettes: Palette[], start: number): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let index = start;
    let view: PreviewView = "editor";

    const render = () => {
      const current = palettes[index];
      if (!current) return;
      // Re-theme the terminal so the whole background updates.
      applyTerminalTheme(current);
      renderPalette(current, view);
      write();
      renderFooter(palettes, index);
    };

    const cleanup = () => {
      restoreTerminalTheme();
      process.stdout.write(SHOW_CURSOR + LEAVE_ALT);
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.removeListener("resize", render);
      process.removeListener("exit", cleanup);
      process.removeListener("SIGINT", killAll);
      process.removeListener("SIGTERM", killAll);
      resolve();
    };

    const killAll = () => process.exit(0);

    const onData = (buf: Buffer) => {
      const action = keyPress(buf);
      switch (action) {
        case "quit":
          cleanup();
          break;
        case "up":
          index = (index - 1 + palettes.length) % palettes.length;
          render();
          break;
        case "down":
          index = (index + 1) % palettes.length;
          render();
          break;
        case "view":
          view = view === "pi" ? "editor" : "pi";
          render();
          break;
        case "enter":
          break;
        default:
          if (action.startsWith("num:")) {
            const n = Number.parseInt(action.slice(4), 10) - 1;
            if (n >= 0 && n < palettes.length) {
              index = n;
              render();
            }
          }
          break;
      }
    };

    // Enter alt screen, then render (which themes the terminal).
    process.stdout.write(ENTER_ALT + HIDE_CURSOR);
    render();

    process.on("exit", cleanup);
    process.on("SIGINT", killAll);
    process.on("SIGTERM", killAll);
    process.stdout.on("resize", render);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}
