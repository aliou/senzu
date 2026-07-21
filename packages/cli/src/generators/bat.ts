import type { Palette } from "../core/types";
import { activeLine, lineNumber, surface } from "../core/ui";
import { PerPaletteGenerator } from "./base";

/**
 * bat (and delta, git-delta, etc.) consume Sublime Text `.tmTheme` files,
 * an XML plist. Themes live in `$(bat --config-dir)/themes/` and are compiled
 * into the cache with `bat cache --build`. The top-level `<key>name</key>`
 * is what `bat --theme=<name>` and `BAT_THEME` resolve against, so we use the
 * variant key (e.g. `senzu-mono`) rather than the display name.
 */
export class BatGenerator extends PerPaletteGenerator {
  name = "bat";
  description = "bat / delta (TextMate .tmTheme)";
  fileExtension = ".tmTheme";

  generate(palette: Palette): string {
    const variant = this.paletteKey(palette);
    const s = palette.syntax;
    const fg = palette.foreground;
    const lines: string[] = [];

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      '<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    );
    lines.push('<plist version="1.0">');
    lines.push("<dict>");
    lines.push("  <key>name</key>");
    lines.push(`  <string>${esc(variant)}</string>`);
    lines.push("  <key>semanticClass</key>");
    lines.push(`  <string>theme.${palette.appearance}.${variant}</string>`);
    lines.push("  <key>colorSpaceName</key>");
    lines.push("  <string>sRGB</string>");
    lines.push("  <key>author</key>");
    lines.push("  <string>aliou</string>");
    lines.push("  <key>uuid</key>");
    lines.push(`  <string>${uuid(variant)}</string>`);

    lines.push("  <key>settings</key>");
    lines.push("  <array>");

    // Global editor settings (no name / scope).
    lines.push("    <dict>");
    lines.push("      <key>settings</key>");
    lines.push("      <dict>");
    global(lines, "background", palette.background);
    global(lines, "caret", palette.cursor);
    global(lines, "foreground", palette.foreground);
    global(
      lines,
      "invisibles",
      palette.ui["editor.invisible"] ?? palette.colors.zambezi ?? "#888888",
    );
    global(lines, "lineHighlight", activeLine(palette));
    global(lines, "selection", palette.selection_background);
    global(lines, "gutter", surface(palette));
    global(lines, "gutterForeground", lineNumber(palette));
    global(lines, "bracketContentsForeground", fg);
    global(lines, "bracketOptionsForeground", palette.ansi.cyan);
    lines.push("      </dict>");
    lines.push("    </dict>");

    // Token rules.
    const rules: TokenRule[] = [
      rule("Comments", "comment, punctuation.definition.comment", s.comment, {
        fontStyle: "italic",
      }),
      rule(
        "Documentation comments",
        "comment.block.documentation",
        s["comment.doc"] ?? s.comment,
      ),
      rule("Constants", "constant, variable.other.constant", s.constant),
      rule("Numbers", "constant.numeric", s.number),
      rule(
        "Booleans / language constants",
        "constant.language, variable.language.this, variable.language.super",
        s.boolean ?? s.constant,
      ),
      rule("Strings", "string", s.string),
      rule(
        "String escapes",
        "constant.character.escape",
        s["string.escape"] ?? s.string,
      ),
      rule(
        "Regular expressions",
        "string.regexp",
        s["string.regex"] ?? s.string,
      ),
      rule(
        "Interpolated / special strings",
        "string.interpolated, string.template, string.other",
        s["string.special"] ?? s.string,
      ),
      rule(
        "Symbols",
        "constant.other.symbol",
        s["string.special.symbol"] ?? s.string,
      ),
      rule(
        "Functions",
        "entity.name.function, meta.require, support.function.any-method",
        s.function,
      ),
      rule(
        "Built-in functions",
        "support.function",
        s["function.builtin"] ?? s.function,
      ),
      rule("Keywords", "keyword, storage.modifier, storage.type", s.keyword),
      rule("Operators", "keyword.operator", s.operator),
      rule("Storage", "storage", s.keyword),
      rule(
        "Types",
        "entity.name.type, support.type, entity.name.class, entity.name.interface",
        s.type,
      ),
      rule(
        "Enums",
        "entity.name.type.enum, entity.name.enum",
        s.enum ?? s.type,
      ),
      rule("Variables", "variable", s.variable),
      rule(
        "Properties",
        "variable.other.property, meta.property-name, support.variable.property",
        s.property ?? s.variable,
      ),
      rule("Tags", "entity.name.tag", s.tag ?? s.string),
      rule("Attributes", "entity.other.attribute-name", s.attribute),
      rule(
        "Namespaces",
        "entity.name.namespace, support.namespace",
        s.namespace ?? s.attribute,
      ),
      rule("Punctuation", "punctuation", s.punctuation),
      rule(
        "Brackets",
        "punctuation.section",
        s["punctuation.bracket"] ?? s.punctuation,
      ),
      rule(
        "Delimiters",
        "punctuation.separator, punctuation.terminator, punctuation.definition.delimiter",
        s["punctuation.delimiter"] ?? s.punctuation,
      ),
      rule(
        "List markers",
        "punctuation.definition.list",
        s["punctuation.list_marker"] ?? s.punctuation,
      ),
      rule(
        "Special punctuation",
        "punctuation.definition.tag, punctuation.section.embedded",
        s["punctuation.special"] ?? s.punctuation,
      ),
      rule("Emphasis", "markup.italic, emphasis", s.emphasis, {
        fontStyle: "italic",
      }),
      rule(
        "Strong emphasis",
        "markup.bold, strong",
        s["emphasis.strong"] ?? s.emphasis,
        { fontStyle: "bold" },
      ),
      rule("Headings", "markup.heading, entity.name.section", s.title, {
        fontStyle: "bold",
      }),
      rule(
        "Inline code / literals",
        "markup.raw.inline, markup.inline.raw, markup.fenced_code.block",
        s["text.literal"] ?? s.string,
      ),
      rule(
        "Links",
        "markup.underline.link, string.other.link",
        s.link_uri ?? s.link_text,
        { fontStyle: "underline" },
      ),
      rule(
        "Link text",
        "string.other.link.title, markup.underline.link",
        s.link_text,
      ),
      rule("Preprocessors", "meta.preprocessor", s.preproc ?? fg),
      rule(
        "Diff added",
        "markup.inserted.diff, meta.diff.header.from-file",
        palette.semantic.ok,
      ),
      rule(
        "Diff removed",
        "markup.deleted.diff, meta.diff.header.to-file",
        palette.semantic.error,
      ),
      rule(
        "Diff context",
        "markup.unchanged.diff",
        palette.colors.grey_chateau ?? palette.colors.grey ?? fg,
      ),
      rule("Errors", "invalid.illegal", palette.semantic.error, {
        fontStyle: "underline",
      }),
      rule("Warnings", "invalid.deprecated", palette.semantic.warning, {
        fontStyle: "underline",
      }),
    ];

    for (const r of rules) {
      if (!r.foreground) continue;
      lines.push("    <dict>");
      lines.push("      <key>name</key>");
      lines.push(`      <string>${esc(r.name)}</string>`);
      lines.push("      <key>scope</key>");
      lines.push(`      <string>${esc(r.scope)}</string>`);
      lines.push("      <key>settings</key>");
      lines.push("      <dict>");
      setting(lines, "foreground", r.foreground);
      if (r.fontStyle) setting(lines, "fontStyle", r.fontStyle);
      if (r.background) setting(lines, "background", r.background);
      lines.push("      </dict>");
      lines.push("    </dict>");
    }

    lines.push("  </array>");
    lines.push("</dict>");
    lines.push("</plist>");
    lines.push("");

    return lines.join("\n");
  }
}

interface TokenRule {
  name: string;
  scope: string;
  foreground: string | undefined;
  fontStyle?: string;
  background?: string;
}

function rule(
  name: string,
  scope: string,
  foreground: string | undefined,
  extra: Pick<TokenRule, "fontStyle" | "background"> = {},
): TokenRule {
  return { name, scope, foreground, ...extra };
}

function global(lines: string[], key: string, value: string): void {
  lines.push(`        <key>${key}</key>`);
  lines.push(`        <string>${esc(value)}</string>`);
}

function setting(lines: string[], key: string, value: string): void {
  lines.push(`        <key>${key}</key>`);
  lines.push(`        <string>${esc(value)}</string>`);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Deterministic UUID (RFC 4122 v5-style layout) derived from the variant
 * name so the generated `.tmTheme` is stable across runs. bat/syntect do
 * not require a uuid, but standard `.tmTheme` files include one.
 */
function uuid(name: string): string {
  let h0 = 0x62908621;
  let h1 = 0x4deadbe1;
  let h2 = 0x9e3779b9;
  let h3 = 0x51d2c1ab;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193) >>> 0;
    h1 = Math.imul((h1 + c) ^ (h0 >>> 7), 0x85ebca6b) >>> 0;
    h2 = Math.imul(h2 ^ h1, 0xc2b2ae3d) >>> 0;
    h3 = Math.imul((h3 + h2) ^ c, 0x27d4eb2f) >>> 0;
  }
  // RFC 4122 version (5) and variant bits.
  h1 = (h1 & 0xffff0fff) | 0x5000;
  h2 = (h2 & 0x3fffffff) | 0x80000000;
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0").slice(-8);
  const s = hex(h0) + hex(h1) + hex(h2) + hex(h3);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
