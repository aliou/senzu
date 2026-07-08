import type { Palette } from "../core/types";
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

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENTER_ALT = "\x1b[?1049h";
const LEAVE_ALT = "\x1b[?1049l";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";
const CLEAR_LINE = "\x1b[2K\r";
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
  write(`  ${BOLD}${DIM}${title}${RESET}`);
  write();
}

/** Map a syntax role to a palette color, falling back to foreground. */
function roleColor(p: Palette, role: Span[0]): string {
  const key = role as keyof typeof p.syntax;
  return p.syntax[key] ?? p.foreground;
}

/** Render a bat-style, syntax-highlighted code listing. */
function renderSample(p: Palette, sample: Sample): void {
  const gutter = p.colors.zambezi ?? "#605958";
  const total = sample.lines.length;
  const numW = String(total).length;
  const termWidth = process.stdout.columns || 80;

  // Top border + file header, like `bat`.
  const rule = "─".repeat(Math.max(termWidth - 9, 10));
  write(`  ${fg(gutter, "───────┬")}${fg(gutter, rule)}`);
  write(
    `  ${fg(gutter, "       │")} ${muted(p, "File:")} ${fg(p.foreground, sample.path)}`,
  );
  write(`  ${fg(gutter, "───────┼")}${fg(gutter, rule)}`);

  for (let i = 0; i < sample.lines.length; i++) {
    const line = sample.lines[i];
    const num = String(i + 1).padStart(numW, " ");
    let body = "";
    if (line) {
      for (const [role, text] of line) {
        const col = roleColor(p, role);
        body +=
          role === "comment"
            ? `\x1b[3m${fg(col, text)}${RESET}`
            : fg(col, text);
      }
    }
    write(`  ${fg(gutter, `${num}   │`)} ${body}`);
  }
  write(`  ${fg(gutter, "───────┴")}${fg(gutter, rule)}`);
  write();
}

function renderPalette(p: Palette): void {
  const { ansi, ansi_bright, semantic, ui } = p;
  /** Theme-adaptive muted label. */
  const m = (s: string) => muted(p, s);

  process.stdout.write(CLEAR_SCREEN);

  // Header
  const accent = p.accents[0] ?? p.foreground;
  write(`  ${BOLD}${fg(accent, p.name)}${RESET}  ${m(`(${p.appearance})`)}`);

  // ANSI 16 as filled cells.
  section("ANSI 16-color");
  const cells: Array<[string, string, number]> = [
    ["black", ansi.black, 0],
    ["red", ansi.red, 1],
    ["green", ansi.green, 2],
    ["yellow", ansi.yellow, 3],
    ["blue", ansi.blue, 4],
    ["magenta", ansi.magenta, 5],
    ["cyan", ansi.cyan, 6],
    ["white", ansi.white, 7],
    ["br-black", ansi_bright.black, 8],
    ["br-red", ansi_bright.red, 9],
    ["br-green", ansi_bright.green, 10],
    ["br-yellow", ansi_bright.yellow, 11],
    ["br-blue", ansi_bright.blue, 12],
    ["br-magenta", ansi_bright.magenta, 13],
    ["br-cyan", ansi_bright.cyan, 14],
    ["br-white", ansi_bright.white, 15],
  ];
  const termWidth = process.stdout.columns || 80;
  const cellW = 14;
  const cols = Math.max(1, Math.floor(termWidth / cellW));
  let line = "";
  for (let i = 0; i < cells.length; i++) {
    const entry = cells[i];
    if (!entry) continue;
    const [label, hex, idx] = entry;
    const block = fb(readableFg(hex), hex, ` ${idx < 10 ? " " : ""}${idx} `);
    line += `  ${block} ${fg("#888888", label.padEnd(8))}`;
    if ((i + 1) % cols === 0) {
      write(line);
      line = "";
    }
  }
  if (line) write(line);

  // A bat-style, syntax-highlighted code listing colored by the palette.
  section("Code sample");
  const sample = SAMPLES[0];
  if (sample) renderSample(p, sample);

  // Semantic + accents as single-line swatches.
  section("Semantic");
  const sem: Array<[string, string]> = [
    ["error", semantic.error],
    ["warning", semantic.warning],
    ["info", semantic.info],
    ["hint", semantic.hint],
    ["ok", semantic.ok],
  ];
  write(
    "  " +
      sem
        .map(([label, hex]) => fb(readableFg(hex), hex, ` ${label} `))
        .join(" "),
  );
  write();

  section("Accents");
  if (p.accents.length > 0) {
    write(
      `  ${p.accents.map((a) => fb(readableFg(a), a, "      ")).join(" ")}`,
    );
    write(`  ${p.accents.map((a, i) => fg(a, String(i + 1))).join("  ")}`);
  }

  // Editor chrome values, for reference.
  section("Editor surface");
  const surf: Array<[string, string | undefined]> = [
    ["background", p.background],
    ["active line", ui["editor.active_line.background"] ?? undefined],
    ["status bar", ui["status_bar.background"] ?? undefined],
    ["surface", ui["surface.background"] ?? undefined],
  ];
  for (const [label, hex] of surf) {
    if (!hex) continue;
    write(
      `  ${fb(readableFg(hex), hex, "  --  ")} ${m(label.padEnd(12))} ${m(hex)}`,
    );
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
  if (s === "\x1b[A" || s === "k") return "up";
  if (s === "\x1b[B" || s === "j") return "down";
  if (s >= "0" && s <= "9") return `num:${s}`;
  return "";
}

function renderFooter(palettes: Palette[], index: number): void {
  // A compact one-line palette strip; active palette highlighted.
  const names = palettes
    .map((p, i) =>
      i === index
        ? fb(readableFg(p.cursor), p.cursor, ` ${p.name} `)
        : `${DIM} ${p.name} ${RESET}`,
    )
    .join(" ");
  process.stdout.write(`${CLEAR_LINE}${names}\n`);
}

function interactiveLoop(palettes: Palette[], start: number): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let index = start;

    const render = () => {
      const current = palettes[index];
      if (!current) return;
      // Re-theme the terminal so the whole background updates.
      applyTerminalTheme(current);
      renderPalette(current);
      write();
      write(`  ${DIM}↑/↓ switch · 1-9 jump · q quit${RESET}`);
      write();
      renderFooter(palettes, index);
    };

    const cleanup = () => {
      restoreTerminalTheme();
      process.stdout.write(SHOW_CURSOR + LEAVE_ALT);
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
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

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}
