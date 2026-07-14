import type { Palette } from "../core/types";
import { PerPaletteGenerator } from "./base";

function toCamelCase(name: string): string {
  if (name === "accent_color_1") return "accent1";
  if (name === "accent_color_2") return "accent2";
  if (name === "str") return "string";
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function buildVars(palette: Palette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette.colors)) {
    vars[toCamelCase(key)] = value;
  }
  vars.error = palette.semantic.error;
  vars.warning = palette.semantic.warning;
  vars.info = palette.semantic.info;
  vars.hint = palette.semantic.hint;
  vars.ok = palette.semantic.ok;
  return vars;
}

function resolveColor(
  targetHex: string,
  vars: Record<string, string>,
  candidates: string[],
): string {
  const target = targetHex.toLowerCase();
  for (const name of candidates) {
    if (name in vars) {
      const val = vars[name];
      if (val && val.toLowerCase() === target) {
        return name;
      }
    }
  }
  return targetHex;
}

const SLOT_DEFS: Record<
  string,
  { getSource: (p: Palette) => string | undefined; candidates: string[] }
> = {
  accent: {
    getSource: (p) =>
      p.colors.accent_color_2 ?? p.colors.morning_glory ?? p.ansi.cyan,
    candidates: ["accent2", "morningGlory"],
  },
  border: {
    getSource: (p) => p.colors.tundora ?? p.ui.border ?? "#404040",
    candidates: ["tundora"],
  },
  borderAccent: {
    getSource: (p) =>
      p.colors.accent_color_1 ?? p.colors.green_smoke ?? p.ansi.green,
    candidates: ["accent1", "greenSmoke"],
  },
  borderMuted: {
    getSource: (p) =>
      p.colors.grey_three ?? p.ui["border.variant"] ?? "#333333",
    candidates: ["greyThree"],
  },
  success: { getSource: (p) => p.semantic.ok, candidates: ["ok"] },
  error: { getSource: (p) => p.semantic.error, candidates: ["error"] },
  warning: { getSource: (p) => p.semantic.warning, candidates: ["warning"] },
  muted: {
    getSource: (p) => p.colors.grey_chateau ?? p.colors.grey ?? "#a0a8b0",
    candidates: ["greyChateau"],
  },
  dim: {
    getSource: (p) => p.colors.scorpion ?? "#606060",
    candidates: ["scorpion"],
  },
  text: { getSource: (p) => p.foreground, candidates: ["foreground"] },
  thinkingText: {
    getSource: (p) => p.colors.regent_grey ?? "#9098A0",
    candidates: ["regentGrey"],
  },
  selectedBg: {
    getSource: (p) =>
      p.colors.grey_one ?? p.ui["surface.background"] ?? "#1c1c1c",
    candidates: ["greyOne"],
  },
  userMessageBg: {
    getSource: (p) => p.colors.grey_three ?? "#333333",
    candidates: ["greyThree"],
  },
  userMessageText: {
    getSource: (p) => p.foreground,
    candidates: ["foreground"],
  },
  customMessageBg: {
    getSource: (p) => p.colors.gravel ?? "#403c41",
    candidates: ["gravel"],
  },
  customMessageText: {
    getSource: (p) => p.foreground,
    candidates: ["foreground"],
  },
  customMessageLabel: {
    getSource: (p) =>
      p.colors.accent_color_1 ?? p.colors.green_smoke ?? p.ansi.green,
    candidates: ["accent1", "greenSmoke"],
  },
  toolPendingBg: {
    getSource: (p) => p.colors.mine_shaft ?? "#1f1f1f",
    candidates: ["mineShaft"],
  },
  toolSuccessBg: {
    getSource: (p) => p.colors.gravel ?? "#403c41",
    candidates: ["gravel"],
  },
  toolErrorBg: {
    getSource: (p) => p.colors.temptress ?? "#40000a",
    candidates: ["temptress"],
  },
  toolTitle: {
    getSource: (p) =>
      p.colors.accent_color_2 ?? p.colors.morning_glory ?? p.ansi.cyan,
    candidates: ["accent2", "morningGlory"],
  },
  toolOutput: { getSource: (p) => p.foreground, candidates: ["foreground"] },
  mdHeading: {
    getSource: (p) =>
      p.colors.accent_color_1 ?? p.colors.green_smoke ?? p.ansi.green,
    candidates: ["accent1", "greenSmoke"],
  },
  mdLink: {
    getSource: (p) =>
      p.colors.accent_color_2 ?? p.colors.morning_glory ?? p.ansi.cyan,
    candidates: ["accent2", "morningGlory"],
  },
  mdLinkUrl: {
    getSource: (p) => p.colors.regent_grey ?? "#9098A0",
    candidates: ["regentGrey"],
  },
  mdCode: {
    getSource: (p) => p.colors.silver ?? "#c7c7c7",
    candidates: ["silver"],
  },
  mdCodeBlock: { getSource: (p) => p.foreground, candidates: ["foreground"] },
  mdCodeBlockBorder: {
    getSource: (p) => p.colors.boulder ?? "#777777",
    candidates: ["boulder"],
  },
  mdQuote: {
    getSource: (p) => p.colors.grey_chateau ?? p.colors.grey ?? "#a0a8b0",
    candidates: ["greyChateau"],
  },
  mdQuoteBorder: {
    getSource: (p) => p.colors.boulder ?? "#777777",
    candidates: ["boulder"],
  },
  mdHr: {
    getSource: (p) => p.colors.boulder ?? "#777777",
    candidates: ["boulder"],
  },
  mdListBullet: {
    getSource: (p) =>
      p.colors.accent_color_2 ?? p.colors.morning_glory ?? p.ansi.cyan,
    candidates: ["accent2", "morningGlory"],
  },
  toolDiffAdded: { getSource: (p) => p.semantic.ok, candidates: ["ok"] },
  toolDiffRemoved: {
    getSource: (p) => p.semantic.error,
    candidates: ["error"],
  },
  toolDiffContext: {
    getSource: (p) => p.colors.grey_chateau ?? p.colors.grey ?? "#a0a8b0",
    candidates: ["greyChateau"],
  },
  syntaxComment: {
    getSource: (p) => p.syntax.comment,
    candidates: ["scorpion", "grey"],
  },
  syntaxKeyword: {
    getSource: (p) => p.syntax.keyword,
    candidates: ["shipCove", "grey"],
  },
  syntaxFunction: {
    getSource: (p) => p.syntax.function,
    candidates: ["goldenrod", "accent2"],
  },
  syntaxVariable: {
    getSource: (p) => p.foreground,
    candidates: ["foreground"],
  },
  syntaxString: {
    getSource: (p) => p.syntax.string,
    candidates: ["greenSmoke", "string"],
  },
  syntaxNumber: {
    getSource: (p) => p.syntax.number,
    candidates: ["rawSienna", "accent1"],
  },
  syntaxType: {
    getSource: (p) => p.syntax.type,
    candidates: ["koromiko", "accent1"],
  },
  syntaxOperator: {
    getSource: (p) => p.colors.boulder ?? p.syntax.operator,
    candidates: ["boulder"],
  },
  syntaxPunctuation: {
    getSource: (p) => p.colors.silver ?? p.syntax.punctuation,
    candidates: ["silver"],
  },
  thinkingOff: {
    getSource: (p) => p.colors.grey_three ?? "#333333",
    candidates: ["greyThree"],
  },
  thinkingMinimal: {
    getSource: (p) => p.colors.boulder ?? "#777777",
    candidates: ["boulder"],
  },
  thinkingLow: {
    getSource: (p) => p.colors.morning_glory ?? "#8fbfdc",
    candidates: ["morningGlory"],
  },
  thinkingMedium: {
    getSource: (p) =>
      p.colors.biloba_flower ?? p.colors.morning_glory ?? "#c6b6ee",
    candidates: ["bilobaFlower", "morningGlory"],
  },
  thinkingHigh: {
    getSource: (p) => p.colors.wewak ?? "#cc88a3",
    candidates: ["wewak"],
  },
  thinkingXhigh: {
    getSource: (p) => p.semantic.warning,
    candidates: ["warning"],
  },
  thinkingMax: {
    getSource: (p) => p.colors.fuchsia,
    candidates: ["fuchsia"],
  },
  bashMode: { getSource: (p) => p.semantic.warning, candidates: ["warning"] },
};

const EXPORT_SLOTS: Record<
  string,
  { getSource: (p: Palette) => string | undefined; candidates: string[] }
> = {
  pageBg: { getSource: (p) => p.background, candidates: ["background"] },
  cardBg: {
    getSource: (p) =>
      p.colors.grey_one ?? p.ui["surface.background"] ?? "#1c1c1c",
    candidates: ["greyOne"],
  },
  infoBg: {
    getSource: (p) => p.colors.mine_shaft ?? "#1f1f1f",
    candidates: ["mineShaft"],
  },
};

export class PiGenerator extends PerPaletteGenerator {
  name = "pi";
  description = "Pi coding agent theme";
  fileExtension = ".json";

  generate(palette: Palette): string {
    const vars = buildVars(palette);
    const variantName = palette.name.toLowerCase().replace(/\s+/g, "-");

    const colors: Record<string, string> = {};
    for (const [slot, def] of Object.entries(SLOT_DEFS)) {
      const targetHex = def.getSource(palette) ?? "";
      colors[slot] = resolveColor(targetHex, vars, def.candidates);
    }

    const exportColors: Record<string, string> = {};
    for (const [slot, def] of Object.entries(EXPORT_SLOTS)) {
      const targetHex = def.getSource(palette) ?? "";
      exportColors[slot] = resolveColor(targetHex, vars, def.candidates);
    }

    const theme = {
      $schema:
        "https://raw.githubusercontent.com/earendil-works/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
      name: variantName,
      vars,
      colors,
      export: exportColors,
    };
    return `${JSON.stringify(theme, null, 2)}\n`;
  }
}
