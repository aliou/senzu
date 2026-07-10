import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Palette } from "../core/types";
import { SAMPLES, type Sample, type Span } from "./samples";

const README_START = "<!-- BEGIN THEME PREVIEWS -->";
const README_END = "<!-- END THEME PREVIEWS -->";
const DEFAULT_PREVIEW_DIR = ".github/assets/previews";
const PREVIEW_FONT_FAMILY =
  "'Berkeley Mono', 'Berkeley Mono Variable', 'TX-02', 'BerkeleyMono Nerd Font', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const INLINE_PREVIEW_KEYS = new Set([
  "senzu",
  "senzu-light",
  "senzu-hc",
  "senzu-hc-light",
]);

interface Options {
  config: string;
  readme: string;
  previews: string;
}

interface PreviewConfig {
  palettes: Record<string, Palette>;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: { type: "string", short: "c", default: "./config.json" },
      readme: { type: "string", default: "./README.md" },
      previews: { type: "string", default: DEFAULT_PREVIEW_DIR },
    },
  });

  const options: Options = {
    config: values.config as string,
    readme: values.readme as string,
    previews: values.previews as string,
  };

  generateReadmePreviews(options);
}

function generateReadmePreviews(options: Options): void {
  const config = JSON.parse(
    readFileSync(resolve(options.config), "utf-8"),
  ) as PreviewConfig;
  const sample = SAMPLES[0];
  if (!sample) throw new Error("No preview sample is configured.");

  const previewDir = resolve(options.previews);
  mkdirSync(previewDir, { recursive: true });

  const entries = getPaletteEntriesOrdered(config.palettes);
  for (const [key, palette] of entries) {
    const previewPath = join(previewDir, `${key}.svg`);
    writeFileSync(previewPath, renderPreviewSvg(palette, sample));
    console.log(`Generated ${relativePath(previewPath)}`);
  }

  updateReadme(resolve(options.readme), entries, options.previews);
}

function getPaletteEntriesOrdered(
  palettes: Record<string, Palette>,
): Array<[string, Palette]> {
  const entries = Object.entries(palettes);
  const byKey = new Map(entries);
  const ordered: Array<[string, Palette]> = [];
  const seen = new Set<string>();

  for (const [key, palette] of entries) {
    if (seen.has(key)) continue;
    if (key.endsWith("-light")) {
      const darkKey = key.slice(0, -"-light".length);
      if (byKey.has(darkKey)) continue;
    }

    ordered.push([key, palette]);
    seen.add(key);

    const lightKey = `${key}-light`;
    const light = byKey.get(lightKey);
    if (light) {
      ordered.push([lightKey, light]);
      seen.add(lightKey);
    }
  }

  for (const [key, palette] of entries) {
    if (!seen.has(key)) ordered.push([key, palette]);
  }

  return ordered;
}

function updateReadme(
  readmePath: string,
  entries: Array<[string, Palette]>,
  previewDir: string,
): void {
  const readme = readFileSync(readmePath, "utf-8");
  const section = renderReadmeSection(entries, previewDir);

  let next: string;
  if (readme.includes(README_START) && readme.includes(README_END)) {
    const before = readme.slice(0, readme.indexOf(README_START));
    const after = readme.slice(readme.indexOf(README_END) + README_END.length);
    next = `${before}${section}${after}`;
  } else {
    next = `${readme.trimEnd()}\n\n${section}\n`;
  }

  writeFileSync(readmePath, next);
  console.log(`Updated ${relativePath(readmePath)}`);
}

function renderReadmeSection(
  entries: Array<[string, Palette]>,
  previewDir: string,
): string {
  const normalizedPreviewDir = previewDir
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
  const lines = [
    README_START,
    "## Theme previews",
    "",
    "Run `pnpm readme:previews` to regenerate these previews after changing or adding palettes.",
    "Each preview uses the same `packages/cli/src/core/swatch.ts` code snippet shown by `senzu preview`.",
    "",
  ];

  for (const [key, palette] of entries) {
    const image = `![${palette.name} theme preview](${normalizedPreviewDir}/${key}.svg)`;
    if (INLINE_PREVIEW_KEYS.has(key)) {
      lines.push(`### ${palette.name}`, "", image, "");
      continue;
    }

    lines.push(
      "<details>",
      `<summary>${palette.name}</summary>`,
      "",
      image,
      "",
      "</details>",
      "",
    );
  }

  lines.push(README_END);
  return lines.join("\n");
}

function renderPreviewSvg(palette: Palette, sample: Sample): string {
  const paddingX = 28;
  const paddingY = 28;
  const gutterWidth = 48;
  const lineHeight = 28;
  const fontSize = 18;
  const charWidth = 10.4;
  const width = 960;
  const height = paddingY * 2 + sample.lines.length * lineHeight;
  const gutter =
    palette.colors.zambezi ??
    palette.ui["editor.line_number"] ??
    palette.foreground;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(palette.name)} theme preview">`,
  );
  out.push(`<rect width="100%" height="100%" fill="${palette.background}"/>`);

  sample.lines.forEach((line, index) => {
    const y = paddingY + fontSize + index * lineHeight;
    out.push(
      `<text x="${paddingX + gutterWidth - 16}" y="${y}" fill="${gutter}" text-anchor="end" font-family="${PREVIEW_FONT_FAMILY}" font-size="${fontSize}">${index + 1}</text>`,
    );

    let x = paddingX + gutterWidth + 10;
    for (const [role, text] of line) {
      const style = role === "comment" ? ' font-style="italic"' : "";
      out.push(
        `<text x="${x.toFixed(1)}" y="${y}" fill="${roleColor(palette, role)}" font-family="${PREVIEW_FONT_FAMILY}" font-size="${fontSize}"${style}>${escapeXml(text)}</text>`,
      );
      x += text.length * charWidth;
    }
  });

  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

function roleColor(palette: Palette, role: Span[0]): string {
  return palette.syntax[role] ?? palette.foreground;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function relativePath(path: string): string {
  return path.startsWith(process.cwd())
    ? path.slice(process.cwd().length + 1)
    : path;
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("An unknown error occurred");
  }
  process.exit(1);
});
