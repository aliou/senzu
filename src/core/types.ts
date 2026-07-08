export type Appearance = "dark" | "light";

export interface AnsiColors {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}

export interface PlayerColors {
  cursor: string;
  background: string;
  selection: string;
}

export interface Palette {
  name: string;
  appearance: Appearance;
  background: string;
  foreground: string;
  cursor: string;
  cursor_text: string;
  selection_background: string;
  selection_foreground: string;
  ansi: AnsiColors;
  ansi_bright: AnsiColors;
  ansi_dim: AnsiColors;
  colors: Record<string, string>;
  semantic: {
    error: string;
    warning: string;
    info: string;
    hint: string;
    ok: string;
  };
  syntax: Record<string, string>;
  ui: Record<string, string | null>;
  accents: string[];
  players: PlayerColors[];
}

export interface Config {
  name: string;
  author: string;
  palettes: Record<string, Palette>;
}

export interface OutputFile {
  relativePath: string;
  contents: string;
}

export interface Generator {
  name: string;
  description: string;
  emit(palettes: Palette[]): OutputFile[];
}
