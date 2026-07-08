import type { Palette } from "../core/types";
import { FamilyGenerator } from "./base";

/**
 * Generates a single Zed theme family JSON (senzu.json) containing
 * all variant themes. Zed uses ThemeFamilyContent: one file with a
 * `themes` array.
 */
export class ZedGenerator extends FamilyGenerator {
  name = "zed";
  description = "Zed editor theme family";
  fileName = "senzu.json";

  generate(palettes: Palette[]): string {
    const family = {
      $schema: "https://zed.dev/schema/themes/v0.2.0.json",
      name: "Senzu",
      author: "aliou",
      themes: palettes.map((p) => this.buildTheme(p)),
    };
    return `${JSON.stringify(family, null, 2)}\n`;
  }

  private buildTheme(palette: Palette): Record<string, unknown> {
    const ui = { ...palette.ui };
    ui.text ??= palette.foreground;
    ui.text_muted ??= palette.colors.grey ?? "#888888";
    ui.text_accent ??=
      palette.colors.morning_glory ??
      palette.colors.accent_color_2 ??
      palette.ansi.cyan;
    ui.icon ??= palette.foreground;
    ui.icon_muted ??= ui.text_muted;
    ui.icon_disabled ??=
      ui.text_placeholder ?? palette.colors.zambezi ?? "#605958";
    ui.icon_accent ??= ui.text_accent;
    ui.background ??= palette.background;

    return {
      name: palette.name,
      appearance: palette.appearance,
      accents: palette.accents,
      style: {
        ...ui,
        syntax: this.buildSyntax(palette),
        players: palette.players,
      },
    };
  }

  private buildSyntax(palette: Palette): Record<string, unknown> {
    const s: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(palette.syntax)) {
      s[key] = {
        color: value,
        font_style: null,
        font_weight: null,
      };
    }
    if (s.comment) {
      (s.comment as Record<string, unknown>).font_style = "italic";
    }
    if (s.emphasis) {
      (s.emphasis as Record<string, unknown>).font_style = "italic";
    }
    if (s.link_text) {
      (s.link_text as Record<string, unknown>).font_style = "italic";
    }
    if (s.predictive) {
      (s.predictive as Record<string, unknown>).font_style = "italic";
    }
    if (s.emphasis_strong) {
      (s.emphasis_strong as Record<string, unknown>).font_weight = 700;
    }
    if (s.title) {
      (s.title as Record<string, unknown>).font_weight = 700;
    }
    if (s.hint) {
      (s.hint as Record<string, unknown>).font_weight = 700;
    }
    return s;
  }
}
