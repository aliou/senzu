import type { Palette } from "../core/types";
import { PerPaletteGenerator } from "./base";

interface TokenColorRule {
  name: string;
  scope?: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

/**
 * Maps Senzu syntax colors to TextMate scopes.
 *
 * The output is a standard JSON TextMate theme with `tokenColors` and
 * `colors` keys. It is compatible with Shiki, VS Code, and any other
 * highlighter that consumes TextMate themes.
 */
export class TextMateGenerator extends PerPaletteGenerator {
  name = "textmate";
  description = "TextMate theme (Shiki/VS Code compatible)";
  fileExtension = ".json";

  generate(palette: Palette): string {
    const theme = {
      name: palette.name,
      type: palette.appearance,
      semanticHighlighting: true,
      colors: this.buildColors(palette),
      tokenColors: this.buildTokenColors(palette),
    };

    return `${JSON.stringify(theme, null, 2)}\n`;
  }

  private buildColors(palette: Palette): Record<string, string> {
    const { ansi, ansi_bright } = palette;
    const lineNumber =
      palette.ui["editor.line_number"] ?? palette.colors.grey ?? "#888888";
    const activeLineNumber =
      palette.ui["editor.active_line_number"] ?? palette.foreground;

    return {
      "editor.background": palette.background,
      "editor.foreground": palette.foreground,
      "editorLineNumber.foreground": lineNumber,
      "editorLineNumber.activeForeground": activeLineNumber,
      "editor.selectionBackground": palette.selection_background,
      "editor.selectionForeground": palette.selection_foreground,
      "editorCursor.foreground": palette.cursor,
      "terminal.ansiBlack": ansi.black,
      "terminal.ansiRed": ansi.red,
      "terminal.ansiGreen": ansi.green,
      "terminal.ansiYellow": ansi.yellow,
      "terminal.ansiBlue": ansi.blue,
      "terminal.ansiMagenta": ansi.magenta,
      "terminal.ansiCyan": ansi.cyan,
      "terminal.ansiWhite": ansi.white,
      "terminal.ansiBrightBlack": ansi_bright.black,
      "terminal.ansiBrightRed": ansi_bright.red,
      "terminal.ansiBrightGreen": ansi_bright.green,
      "terminal.ansiBrightYellow": ansi_bright.yellow,
      "terminal.ansiBrightBlue": ansi_bright.blue,
      "terminal.ansiBrightMagenta": ansi_bright.magenta,
      "terminal.ansiBrightCyan": ansi_bright.cyan,
      "terminal.ansiBrightWhite": ansi_bright.white,
    };
  }

  private buildTokenColors(palette: Palette): TokenColorRule[] {
    const s = palette.syntax;
    const fg = palette.foreground;

    return [
      {
        name: "Default foreground and background",
        settings: {
          foreground: fg,
          background: palette.background,
        },
      },
      this.rule(
        "Comments",
        ["comment", "punctuation.definition.comment"],
        s.comment,
        {
          fontStyle: "italic",
        },
      ),
      this.rule(
        "Documentation comments",
        ["comment.block.documentation"],
        s["comment.doc"] ?? s.comment,
      ),
      this.rule(
        "Constants",
        ["constant", "variable.other.constant"],
        s.constant,
      ),
      this.rule("Numbers", ["constant.numeric"], s.number),
      this.rule(
        "Booleans / language constants",
        [
          "constant.language",
          "variable.language.this",
          "variable.language.super",
        ],
        s.boolean ?? s.constant,
      ),
      this.rule("Strings", ["string"], s.string),
      this.rule(
        "String escapes",
        ["constant.character.escape"],
        s["string.escape"] ?? s.string,
      ),
      this.rule(
        "Regular expressions",
        ["string.regexp"],
        s["string.regex"] ?? s.string,
      ),
      this.rule(
        "Interpolated / special strings",
        ["string.interpolated", "string.template", "string.other"],
        s["string.special"] ?? s.string,
      ),
      this.rule(
        "Symbols",
        ["constant.other.symbol"],
        s["string.special.symbol"] ?? s.string,
      ),
      this.rule("Functions", ["entity.name.function"], s.function),
      this.rule(
        "Built-in functions",
        ["support.function"],
        s["function.builtin"] ?? s.function,
      ),
      this.rule(
        "Keywords",
        ["keyword", "storage.modifier", "storage.type"],
        s.keyword,
      ),
      this.rule("Operators", ["keyword.operator"], s.operator),
      this.rule(
        "Types",
        [
          "entity.name.type",
          "support.type",
          "entity.name.type.class",
          "entity.name.type.interface",
        ],
        s.type,
      ),
      this.rule("Variables", ["variable"], s.variable),
      this.rule(
        "Properties",
        [
          "variable.other.property",
          "support.variable.property",
          "meta.property-name",
        ],
        s.property ?? s.variable,
      ),
      this.rule("Tags", ["entity.name.tag"], s.tag ?? s.string),
      this.rule("Attributes", ["entity.other.attribute-name"], s.attribute),
      this.rule(
        "Namespaces",
        ["entity.name.namespace", "support.namespace"],
        s.namespace ?? s.attribute,
      ),
      this.rule("Punctuation", ["punctuation"], s.punctuation),
      this.rule(
        "Brackets",
        ["punctuation.section"],
        s["punctuation.bracket"] ?? s.punctuation,
      ),
      this.rule(
        "Delimiters",
        [
          "punctuation.separator",
          "punctuation.terminator",
          "punctuation.definition.delimiter",
        ],
        s["punctuation.delimiter"] ?? s.punctuation,
      ),
      this.rule(
        "List markers",
        ["punctuation.definition.list"],
        s["punctuation.list_marker"] ?? s.punctuation,
      ),
      this.rule(
        "Special punctuation",
        ["punctuation.definition.tag", "punctuation.section.embedded"],
        s["punctuation.special"] ?? s.punctuation,
      ),
      this.rule(
        "Embedded punctuation",
        ["punctuation.section.embedded"],
        s.embedded ?? s.punctuation,
      ),
      this.rule(
        "Links",
        ["markup.underline.link", "string.other.link.title"],
        s.link_text,
        {
          fontStyle: "italic underline",
        },
      ),
      this.rule(
        "Link URIs",
        ["markup.underline.link"],
        s.link_uri ?? s.link_text,
        {
          fontStyle: "underline",
        },
      ),
      this.rule("Emphasis", ["markup.italic", "emphasis"], s.emphasis, {
        fontStyle: "italic",
      }),
      this.rule(
        "Strong emphasis",
        ["markup.bold", "strong"],
        s["emphasis.strong"] ?? s.emphasis,
        {
          fontStyle: "bold",
        },
      ),
      this.rule("Headings", ["markup.heading"], s.title, {
        fontStyle: "bold",
      }),
      this.rule(
        "Inline code / literals",
        ["markup.inline.raw", "markup.fenced_code.block"],
        s["text.literal"] ?? s.string,
      ),
      this.rule("Preprocessors", ["meta.preprocessor"], s.preproc ?? fg),
      this.rule("Enums", ["entity.name.type.enum"], s.enum ?? s.type),
    ].filter((rule): rule is TokenColorRule => rule !== null);
  }

  private rule(
    name: string,
    scope: string | string[],
    foreground: string | undefined,
    extra: Omit<TokenColorRule["settings"], "foreground"> = {},
    fallback?: string,
  ): TokenColorRule | null {
    const color = foreground ?? fallback;
    if (!color) return null;

    return {
      name,
      scope,
      settings: {
        foreground: color,
        ...extra,
      },
    };
  }
}
