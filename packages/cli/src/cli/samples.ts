/**
 * Pre-tokenized code samples for the preview command.
 *
 * Each sample is a list of lines, and each line is a list of `[role, text]`
 * spans. Roles map directly onto the palette's `syntax.*` slots so the
 * listing is recolored per theme — same approach Ghostty's `+list-themes`
 * takes (it ships a hand-tokenized ziggzagg.zig), zero highlighter deps.
 *
 * To add a sample: append another entry with its own spans.
 */

export type Role =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "type"
  | "constant"
  | "operator"
  | "punctuation"
  | "preproc"
  | "attribute"
  | "tag"
  | "variable"
  | "text";

export type Span = [Role, string];

export interface Sample {
  /** Shown in the bat-style header, e.g. "src/generators/swatch.ts". */
  path: string;
  lines: Span[][];
}

// Tiny authoring helpers keep the sample readable below.
const k = (t: string): Span => ["keyword", t];
const s = (t: string): Span => ["string", t];
const c = (t: string): Span => ["comment", t];
const n = (t: string): Span => ["number", t];
const f = (t: string): Span => ["function", t];
const t = (t: string): Span => ["type", t];
const o = (t: string): Span => ["operator", t];
const p = (t: string): Span => ["punctuation", t];
const v = (t: string): Span => ["variable", t];
const x = (t: string): Span => ["text", t];

export const SAMPLES: Sample[] = [
  {
    path: "packages/cli/src/core/swatch.ts",
    lines: [
      [c("// swatch.ts — render an ANSI color cell")],
      [x("")],
      [
        k("import"),
        x(" "),
        k("type"),
        x(" "),
        p("{"),
        x(" "),
        t("Palette"),
        x(" "),
        p("}"),
        x(" "),
        k("from"),
        x(" "),
        s('"../core/types"'),
        p(";"),
      ],
      [x("")],
      [c("/** Returns the 24-bit RGB escape for a hex color. */")],
      [
        k("export"),
        x(" "),
        k("function"),
        x(" "),
        f("rgb"),
        p("("),
        v("hex"),
        p(":"),
        x(" "),
        t("string"),
        p(")"),
        p(":"),
        x(" "),
        t("string"),
        x(" "),
        p("{"),
      ],
      [
        x("  "),
        k("const"),
        x(" "),
        v("n"),
        x(" "),
        o("="),
        x(" "),
        f("Number.parseInt"),
        p("("),
        v("hex"),
        p("."),
        f("slice"),
        p("("),
        n("1"),
        p(")"),
        p(","),
        x(" "),
        n("16"),
        p(")"),
        p(";"),
      ],
      [
        x("  "),
        k("const"),
        x(" "),
        p("["),
        v("r"),
        p(","),
        x(" "),
        v("g"),
        p(","),
        x(" "),
        v("b"),
        p("]"),
        x(" "),
        o("="),
        x(" "),
        p("["),
        v("n"),
        x(" "),
        o(">>"),
        x(" "),
        n("16"),
        p(","),
        x(" "),
        p("("),
        v("n"),
        x(" "),
        o(">>"),
        x(" "),
        n("8"),
        p(")"),
        x(" "),
        o("&"),
        x(" "),
        n("255"),
        p(","),
        x(" "),
        v("n"),
        x(" "),
        o("&"),
        x(" "),
        n("255"),
        p("]"),
        p(";"),
      ],
      [
        x("  "),
        k("return"),
        x(" "),
        s("`\\x1b[38;2;"),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal code-sample text
        v("${r}"),
        s(";"),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal code-sample text
        v("${g}"),
        s(";"),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal code-sample text
        v("${b}"),
        s("m`"),
        p(";"),
      ],
      [p("}")],
      [x("")],
      [
        k("export"),
        x(" "),
        k("function"),
        x(" "),
        f("swatch"),
        p("("),
        v("p"),
        p(":"),
        x(" "),
        t("Palette"),
        p(","),
        x(" "),
        v("i"),
        p(":"),
        x(" "),
        t("number"),
        p(")"),
        p(":"),
        x(" "),
        t("string"),
        x(" "),
        p("{"),
      ],
      [
        x("  "),
        k("return"),
        x(" "),
        f("rgb"),
        p("("),
        v("p"),
        p("."),
        v("accents"),
        p("["),
        v("i"),
        p("]"),
        x(" "),
        o("??"),
        x(" "),
        s('"#000000"'),
        p(")"),
        x(" "),
        o("+"),
        x(" "),
        s('"████\\x1b[0m"'),
        p(";"),
      ],
      [p("}")],
    ],
  },
];
