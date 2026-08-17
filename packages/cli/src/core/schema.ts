import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, {
  message: "Must be a valid hex color (e.g., #cf6a4c or #cf6a4c88)",
});

const variantKey = z
  .string()
  .min(1)
  .refine(
    (key) => {
      if (!/^(0|[1-9]\d*)$/.test(key)) return true;
      return Number(key) > 4294967294;
    },
    { message: "Must not be an array-index-like key" },
  );

const nullableHex = z.union([hexColor, z.null()]);

const ansiColorsSchema = z.object({
  black: hexColor,
  red: hexColor,
  green: hexColor,
  yellow: hexColor,
  blue: hexColor,
  magenta: hexColor,
  cyan: hexColor,
  white: hexColor,
});

const playerColorsSchema = z.object({
  cursor: hexColor,
  background: hexColor,
  selection: hexColor,
});

const paletteSchema = z.object({
  name: z.string().min(1),
  appearance: z.enum(["dark", "light"]),
  background: hexColor,
  foreground: hexColor,
  cursor: hexColor,
  cursor_text: hexColor,
  selection_background: hexColor,
  selection_foreground: hexColor,
  ansi: ansiColorsSchema,
  ansi_bright: ansiColorsSchema,
  ansi_dim: ansiColorsSchema,
  colors: z.record(hexColor),
  semantic: z.object({
    error: hexColor,
    warning: hexColor,
    info: hexColor,
    hint: hexColor,
    ok: hexColor,
  }),
  syntax: z.record(hexColor),
  ui: z.record(nullableHex),
  accents: z.array(hexColor),
  players: z.array(playerColorsSchema),
});

const themeVariantSchema = z.object({
  key: variantKey,
  palette: paletteSchema,
});

export const configSchema = z.object({
  name: z.string().min(1),
  author: z.string().min(1),
  palettes: z.record(variantKey, paletteSchema),
});

export const themeFamilySchema = z.object({
  family: z.string().min(1),
  variants: z.array(themeVariantSchema),
});

export const themeIndexSchema = z.object({
  name: z.string().min(1),
  author: z.string().min(1),
  variants: z.array(variantKey),
});

export type ConfigSchema = z.infer<typeof configSchema>;
