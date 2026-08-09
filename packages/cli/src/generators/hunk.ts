import { opaque } from "../core/color";
import type { OutputFile, Palette } from "../core/types";
import {
  border,
  elevatedSurface,
  lineNumber,
  surface,
  textMuted,
} from "../core/ui";
import { PerPaletteGenerator } from "./base";

/**
 * Blend `color` over the palette background with a given alpha (0-255),
 * producing the opaque `#rrggbb` Hunk requires for every color slot.
 */
function tint(color: string, background: string, alpha: number): string {
  const hex = alpha.toString(16).padStart(2, "0");
  return opaque(`${color}${hex}`, background);
}

/**
 * Senzu syntax slot -> Shiki/TextMate scope selectors, in declaration order.
 * Later (more specific) selectors win under Shiki's matching rules.
 * Requires hunk >= 0.18.
 */
const SYNTAX_SCOPE_MAP: [string, string[]][] = [
  ["comment", ["comment", "punctuation.definition.comment"]],
  ["comment.doc", ["comment.documentation"]],
  ["keyword", ["keyword", "storage.type", "storage.modifier"]],
  ["operator", ["keyword.operator"]],
  ["punctuation", ["punctuation"]],
  ["string", ["string"]],
  ["string.escape", ["constant.character.escape"]],
  ["string.regex", ["string.regexp"]],
  ["string.special.symbol", ["constant.other.symbol"]],
  ["number", ["constant.numeric"]],
  ["boolean", ["constant.language.boolean"]],
  ["constant", ["constant", "variable.other.constant"]],
  ["function", ["entity.name.function", "variable.function"]],
  ["function.builtin", ["support.function.builtin"]],
  ["constructor", ["entity.name.function.constructor"]],
  ["variable", ["variable"]],
  ["property", ["variable.other.property", "support.type.property-name"]],
  ["type", ["entity.name.type", "support.type"]],
  ["enum", ["entity.name.type.enum"]],
  ["variant", ["variable.other.enummember"]],
  ["namespace", ["entity.name.namespace"]],
  ["tag", ["entity.name.tag"]],
  ["attribute", ["entity.other.attribute-name"]],
  ["label", ["entity.name.label"]],
  ["title", ["markup.heading"]],
  ["emphasis", ["markup.italic"]],
  ["emphasis.strong", ["markup.bold"]],
  ["text.literal", ["markup.raw", "markup.inline.raw"]],
  ["link_text", ["string.other.link"]],
  ["link_uri", ["markup.underline.link"]],
  ["embedded", ["variable.interpolation", "meta.interpolation"]],
];

/** Resolve every overridable color slot of a Hunk theme from one palette. */
function resolveSlots(palette: Palette): [string, string][] {
  const bg = palette.background;
  const light = palette.appearance === "light";

  const accent = (
    palette.ui["panel.focused_border"] ?? palette.cursor
  ).toLowerCase();
  const added = palette.ui["version_control_added"] ?? palette.ansi.green;
  const removed = palette.ui["version_control_deleted"] ?? palette.ansi.red;
  const modified =
    palette.ui["version_control_modified"] ?? palette.semantic.warning;
  const renamed = palette.ui.renamed ?? palette.semantic.info;
  const panelAlt = elevatedSurface(palette);
  // Hunk's built-ins tint added/removed content slightly stronger than the
  // row background: 0.28 on dark themes, 0.18 on light themes.
  const contentAlpha = light ? 0x2e : 0x47;
  // Some light palettes carry dark-theme diff backgrounds in the canonical
  // config; tint from the sign colors instead so rows stay readable.
  const rowTintAlpha = light ? 0x28 : 0x33;
  const createdBg = light
    ? tint(added, bg, rowTintAlpha)
    : (palette.ui["created.background"] ?? tint(added, bg, rowTintAlpha));
  const deletedBg = light
    ? tint(removed, bg, rowTintAlpha)
    : (palette.ui["deleted.background"] ?? tint(removed, bg, rowTintAlpha));

  return [
    ["background", bg],
    ["panel", surface(palette)],
    ["panelAlt", panelAlt],
    ["border", border(palette)],
    ["accent", accent],
    ["accentMuted", palette.ui["element.active"] ?? accent],
    ["text", palette.foreground],
    ["muted", textMuted(palette)],
    ["addedBg", opaque(createdBg, bg)],
    ["removedBg", opaque(deletedBg, bg)],
    ["movedAddedBg", tint(palette.semantic.info, bg, 0x30)],
    ["movedRemovedBg", tint(palette.semantic.info, bg, 0x22)],
    ["contextBg", bg],
    ["addedContentBg", tint(added, bg, contentAlpha)],
    ["removedContentBg", tint(removed, bg, contentAlpha)],
    [
      "contextContentBg",
      opaque(palette.ui["editor.active_line.background"] ?? panelAlt, bg),
    ],
    ["addedSignColor", added],
    ["removedSignColor", removed],
    ["lineNumberBg", palette.ui["editor.gutter.background"] ?? bg],
    ["lineNumberFg", lineNumber(palette)],
    ["selectedHunk", opaque(palette.ui["element.selected"] ?? panelAlt, bg)],
    ["badgeAdded", added],
    ["badgeRemoved", removed],
    ["badgeNeutral", textMuted(palette)],
    ["fileNew", added],
    ["fileDeleted", removed],
    ["fileRenamed", renamed],
    ["fileModified", modified],
    ["fileUntracked", added],
    ["noteBorder", accent],
    ["noteBackground", panelAlt],
    ["noteTitleBackground", tint(accent, panelAlt, 0x1f)],
    ["noteTitleText", accent],
  ];
}

/**
 * Hunk themes live in the user's TOML config rather than standalone files.
 * `share/hunk/<variant>.toml` is the modern named-table snippet (hunk >=
 * 0.18); `share/hunk/<variant>.legacy.toml` targets the single-slot
 * `[custom_theme]` table that hunk <= 0.17 understands.
 */
export class HunkGenerator extends PerPaletteGenerator {
  name = "hunk";
  description = "Hunk terminal diff viewer config snippet";
  fileExtension = ".toml";

  emit(palettes: Palette[]): OutputFile[] {
    return palettes.flatMap((palette) => {
      const variantKey = this.paletteKey(palette);
      return [
        {
          relativePath: `share/${this.name}/${variantKey}${this.fileExtension}`,
          contents: this.generate(palette),
        },
        {
          relativePath: `share/${this.name}/${variantKey}.legacy${this.fileExtension}`,
          contents: this.generateLegacy(palette),
        },
      ];
    });
  }

  /** Modern format: a `[themes.<id>]` table with exact Shiki scope colors. */
  generate(palette: Palette): string {
    const id = this.paletteKey(palette);
    const base =
      palette.appearance === "light"
        ? "github-light-default"
        : "github-dark-default";

    const slotLines = resolveSlots(palette)
      .map(([key, value]) => `${key} = "${value}"`)
      .join("\n");

    const scopeLines: string[] = [];
    for (const [slot, scopes] of SYNTAX_SCOPE_MAP) {
      const color = palette.syntax[slot];
      if (!color) continue;
      for (const scope of scopes) {
        scopeLines.push(`"${scope}" = "${color}"`);
      }
    }

    return `# Senzu Theme for Hunk: ${palette.name}
# Generated by senzu
#
# Hunk has no standalone theme files. Merge these tables into
# ~/.config/hunk/config.toml (or a repo's .hunk/config.toml), then select the
# theme with:
#
#   theme = "${id}"
#
# or press "t" inside Hunk and pick "${palette.name}".
#
# Requires hunk >= 0.18. For hunk <= 0.17 use ${id}.legacy.toml instead.

[themes.${id}]
base = "${base}"
label = "${palette.name}"
${slotLines}

[themes.${id}.syntax_scopes]
${scopeLines.join("\n")}
`;
  }

  /**
   * Legacy format: the single `[custom_theme]` table with role-based
   * `[custom_theme.syntax]` colors, the only form hunk <= 0.17 accepts.
   */
  generateLegacy(palette: Palette): string {
    const base =
      palette.appearance === "light"
        ? "github-light-default"
        : "github-dark-default";

    const slotLines = resolveSlots(palette)
      .map(([key, value]) => `${key} = "${value}"`)
      .join("\n");

    const syntax = palette.syntax;
    const syntaxLines = [
      ["default", syntax.variable ?? palette.foreground],
      ["keyword", syntax.keyword],
      ["string", syntax.string],
      ["comment", syntax.comment],
      ["number", syntax.number],
      ["function", syntax.function],
      ["property", syntax.property],
      ["type", syntax.type],
      ["variable", syntax.variable],
      ["operator", syntax.operator],
      ["punctuation", syntax.punctuation],
    ]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([key, value]) => `${key} = "${value}"`)
      .join("\n");

    return `# Senzu Theme for Hunk (legacy format): ${palette.name}
# Generated by senzu
#
# For hunk <= 0.17, which only supports the single-slot [custom_theme] table.
# Replace any existing [custom_theme] in ~/.config/hunk/config.toml with these
# tables and set:
#
#   theme = "custom"
#
# Only one custom theme can exist at a time in this format. On hunk >= 0.18
# prefer ${this.paletteKey(palette)}.toml, which also carries exact Shiki
# syntax scope colors.

[custom_theme]
base = "${base}"
label = "${palette.name}"
${slotLines}

[custom_theme.syntax]
${syntaxLines}
`;
  }
}
