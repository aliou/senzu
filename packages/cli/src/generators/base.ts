import type { Generator, OutputFile, Palette } from "../core/types";

/**
 * Per-palette generators produce one file per palette variant.
 * e.g. ghostty/senzu, ghostty/senzu-mono, ...
 */
export abstract class PerPaletteGenerator implements Generator {
  abstract name: string;
  abstract description: string;
  abstract fileExtension: string;

  abstract generate(palette: Palette): string;

  emit(palettes: Palette[]): OutputFile[] {
    return palettes.map((palette) => {
      const variantKey = this.paletteKey(palette);
      return {
        relativePath: `share/${this.name}/${variantKey}${this.fileExtension}`,
        contents: this.generate(palette),
      };
    });
  }

  paletteKey(palette: Palette): string {
    return palette.name.toLowerCase().replace(/\s+/g, "-");
  }
}

/**
 * Family generators produce a single file from all palettes.
 * e.g. zed/senzu.json containing every variant theme.
 */
export abstract class FamilyGenerator implements Generator {
  abstract name: string;
  abstract description: string;
  abstract fileName: string;

  abstract generate(palettes: Palette[]): string;

  emit(palettes: Palette[]): OutputFile[] {
    return [
      {
        relativePath: `share/${this.name}/${this.fileName}`,
        contents: this.generate(palettes),
      },
    ];
  }
}
