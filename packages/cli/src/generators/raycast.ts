import type { Palette } from "../core/types";
import { PerPaletteGenerator } from "./base";

/**
 * Raycast custom themes (Raycast Pro).
 *
 * Raycast does not read theme files from a config directory; custom themes
 * live in Raycast's internal storage and are imported by pasting JSON into
 * Theme Studio or by opening a themes.ray.so share URL. Each file here is
 * meant for "Theme Studio -> right-click theme list -> Add/paste JSON".
 *
 * The 12-slot schema mirrors what Raycast's own "Copy as JSON" emits
 * (see the archived raycast/theme-explorer repo for reference themes):
 * background layers, text, selection, loader, and the seven accent colors.
 */
export class RaycastGenerator extends PerPaletteGenerator {
  name = "raycast";
  description = "Raycast Theme Studio (paste JSON to import)";
  fileExtension = ".json";

  generate(palette: Palette): string {
    const colors = {
      background: palette.background,
      backgroundSecondary:
        palette.ui["elevated_surface.background"] ?? palette.background,
      text: palette.foreground,
      selection: palette.selection_background,
      loader: palette.ansi.blue,
      red: palette.ansi.red,
      orange: palette.semantic.warning,
      yellow: palette.ansi.yellow,
      green: palette.ansi.green,
      blue: palette.ansi.blue,
      purple: palette.ansi.magenta,
      magenta: palette.colors.fuchsia ?? palette.ansi.magenta,
    };

    const theme = {
      author: "Aliou Diallo",
      authorUsername: "aliou",
      version: 1,
      appearance: palette.appearance,
      name: palette.name,
      colors,
    };
    return `${JSON.stringify(theme, null, 2)}\n`;
  }
}
