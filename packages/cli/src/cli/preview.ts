import type { Palette } from "../core/types";

/* ------------------------------------------------------------------ */
/* ANSI / color helpers                                                */
/* ------------------------------------------------------------------ */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").slice(0, 6);
  const num = Number.parseInt(clean, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function rgb(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r};${g};${b}`;
}

/** Colored background run. */
function bg(hex: string, text: string): string {
  return `\x1b[48;2;${rgb(hex)}m${text}${RESET}`;
}

/** Colored foreground run. */
function fg(hex: string, text: string): string {
  return `\x1b[38;2;${rgb(hex)}m${text}${RESET}`;
}

/** Foreground + background together. */
function fb(fgHex: string, bgHex: string, text: string): string {
  return `\x1b[38;2;${rgb(fgHex)};\x1b[48;2;${rgb(bgHex)}m${text}${RESET}`;
}

/** Pick a legible foreground (black/white) for a given background hex. */
function readableFg(bgHex: string): string {
  const [r, g, b] = hexToRgb(bgHex);
  // Relative luminance (sRGB) -> perceived brightness.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

const BLOCK = "        "; // 8-space swatch
const CELL_W = 26;

function cell(label: string, hex: string): string {
  const swatch = fb(
    readableFg(hex),
    hex,
    BLOCK.slice(0, 4) + hex.slice(1) + BLOCK.slice(0, 4),
  );
  const padded = label.padEnd(CELL_W - 8);
  return `  ${swatch} ${fg(hex, padded)}${DIM}${hex}${RESET}`;
}

/* ------------------------------------------------------------------ */
/* Palette rendering                                                   */
/* ------------------------------------------------------------------ */

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function write(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function header(p: Palette): void {
  const title = fb(readableFg(p.background), p.background, ` ${p.name} `);
  write();
  write(`  ${BOLD}${title}${RESET}  ${DIM}(${p.appearance})${RESET}`);
  write();
}

function section(title: string): void {
  write();
  write(`  ${BOLD}${title}${RESET}`);
  write();
}

function renderPalette(p: Palette): void {
  const { ansi, ansi_bright, syntax, semantic, ui } = p;

  clearScreen();
  header(p);

  // Core surface colors with sample text.
  section("Surfaces");
  const sample = " Aa ";
  const surfaces: Array<[string, string, string]> = [
    [
      "background",
      p.background,
      bg(p.background, fg(p.foreground, `${sample}fg/bg`)),
    ],
    ["cursor", p.cursor, fb(p.cursor_text, p.cursor, `${sample}cursor`)],
    [
      "selection",
      p.selection_background,
      fb(p.selection_foreground, p.selection_background, `${sample}selection`),
    ],
  ];
  for (const [, hex, swatch] of surfaces) {
    write(`  ${swatch}  ${fg(hex, "surface".padEnd(14))}${DIM}${hex}${RESET}`);
  }

  // ANSI 16 colors.
  section("ANSI");
  const ansiEntries: Array<[string, string]> = [
    ["black", ansi.black],
    ["red", ansi.red],
    ["green", ansi.green],
    ["yellow", ansi.yellow],
    ["blue", ansi.blue],
    ["magenta", ansi.magenta],
    ["cyan", ansi.cyan],
    ["white", ansi.white],
  ];
  writeCells(ansiEntries);

  write();
  const brightEntries: Array<[string, string]> = [
    ["black", ansi_bright.black],
    ["red", ansi_bright.red],
    ["green", ansi_bright.green],
    ["yellow", ansi_bright.yellow],
    ["blue", ansi_bright.blue],
    ["magenta", ansi_bright.magenta],
    ["cyan", ansi_bright.cyan],
    ["white", ansi_bright.white],
  ];
  writeCells(brightEntries);

  // Syntax with representative samples.
  section("Syntax");
  const sx = (key: string, sample: string): [string, string, string] => [
    key,
    syntax[key] ?? p.foreground,
    sample,
  ];
  const syntaxEntries: Array<[string, string, string]> = [
    sx("comment", "// a comment"),
    sx("string", '"a string"'),
    sx("number", "42"),
    sx("keyword", "const"),
    sx("function", "fn()"),
    sx("type", "Type"),
    sx("operator", "=>"),
    sx("constant", "PI"),
  ];
  for (const [label, hex, sampleText] of syntaxEntries) {
    const swatch = fb(readableFg(hex), hex, "  ◆  ");
    write(`  ${swatch}  ${fg(hex, label.padEnd(12))}${fg(hex, sampleText)}`);
  }

  // Semantic.
  section("Semantic");
  writeCells([
    ["error", semantic.error],
    ["warning", semantic.warning],
    ["info", semantic.info],
    ["hint", semantic.hint],
    ["ok", semantic.ok],
  ]);

  // Accents.
  if (p.accents.length > 0) {
    section("Accents");
    write();
    const accentSwatches = p.accents
      .map((a) => fb(readableFg(a), a, "      "))
      .join(" ");
    write(`  ${accentSwatches}`);
    write();
    write(`  ${p.accents.map((a, i) => fg(a, String(i + 1))).join("  ")}`);
  }

  // Editor chrome (line, status, etc.) where available.
  section("Editor chrome");
  const chrome: Array<[string, string]> = [];
  const activeLine = ui["editor.active_line.background"];
  const lineNr = ui["editor.line_number"];
  const activeLineNr = ui["editor.active_line_number"];
  const statusBar = ui["status_bar.background"];
  if (activeLine) chrome.push(["active line", activeLine]);
  if (lineNr) chrome.push(["line number", lineNr]);
  if (activeLineNr) chrome.push(["active line nr", activeLineNr]);
  if (statusBar) chrome.push(["status bar", statusBar]);
  writeCells(chrome.length > 0 ? chrome : [["(none defined)", "#888888"]]);

  write();
  write(
    `  ${DIM}Press a palette index / ↑↓ Enter to switch · q to quit${RESET}`,
  );
  write();
}

function writeCells(entries: Array<[string, string]>): void {
  const cols = Math.max(1, Math.floor((process.stdout.columns || 80) / CELL_W));
  let line = "";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const [label, hex] = entry;
    line += cell(label, hex);
    if ((i + 1) % cols === 0) {
      write(line);
      line = "";
    }
  }
  if (line) write(line);
}

/* ------------------------------------------------------------------ */
/* Interactive picker                                                  */
/* ------------------------------------------------------------------ */

export async function runPreview(
  palettes: Palette[],
  preselected?: string,
): Promise<void> {
  if (palettes.length === 0) {
    throw new Error("No palettes available to preview.");
  }

  let index = 0;
  // Allow `senzu preview senzu-hc-light` to jump straight in.
  if (preselected) {
    const found = palettes.findIndex(
      (p) => p.name.toLowerCase().replace(/\s+/g, "-") === preselected,
    );
    if (found === -1) {
      throw new Error(`No palette matching: ${preselected}`);
    }
    index = found;
  }

  // Non-interactive: just render once and exit.
  if (!process.stdin.isTTY || preselected) {
    const current = palettes[index];
    if (current) renderPalette(current);
    return;
  }

  await interactiveLoop(palettes, index);
}

function keyPress(buf: Buffer): string {
  const s = buf.toString("utf8");
  if (s === "\r" || s === "\n") return "enter";
  if (s === "q" || s === "\x03" || s === "\x1b") return "quit";
  if (s === "\x1b[A" || s === "k") return "up";
  if (s === "\x1b[B" || s === "j") return "down";
  if (s >= "0" && s <= "9") return `num:${s}`;
  return "";
}

function interactiveLoop(palettes: Palette[], start: number): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let index = start;

    // Show a palette picker line at the bottom of the current render.
    const renderFooter = () => {
      const names = palettes
        .map((p, i) =>
          i === index
            ? bg(p.cursor, ` ${p.name} `)
            : `${DIM} ${p.name} ${RESET}`,
        )
        .join(" ");
      process.stdout.write(`\x1b[2K\r${names}`);
    };

    const render = () => {
      const current = palettes[index];
      if (current) renderPalette(current);
      renderFooter();
    };

    render();

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    process.stdout.write(HIDE_CURSOR);

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
          // No-op in single preview: palette already rendered.
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

    const cleanup = () => {
      process.stdout.write(SHOW_CURSOR);
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      // Leave a clean line after exit.
      process.stdout.write("\x1b[2K\r");
      resolve();
      // eslint-disable-next-line no-process-exit, n/no-process-exit
      process.exit(0);
    };

    stdin.on("data", onData);
  });
}
