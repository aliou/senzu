/**
 * Color helpers for sanitizing palette colors for targets that cannot consume
 * 8-digit hex (alpha) values.
 *
 * The canonical theme files store slots such as
 * `editor.active_line.background` with transparent colors like
 * `#1c1c1cbf` (alpha = 0xbf). Most terminal/editor targets only accept
 * 6-digit `#rrggbb`, and Neovim's `nvim_set_hl` raises `E5113: Invalid
 * highlight color` for alpha hex. `opaque` composites an alpha color over a
 * solid backdrop so the rendered result matches the author's intent.
 */

const HEX_RGB = /^#?([0-9a-f]{6})$/i;
const HEX_RGBA = /^#?([0-9a-f]{6})([0-9a-f]{2})$/i;

/**
 * True when `color` carries an explicit alpha channel (`#rrggbbaa`).
 */
export function hasAlpha(color: string): boolean {
  return HEX_RGBA.test(color);
}

function toRgb(color: string): [number, number, number, number] {
  const rgba = color.match(HEX_RGBA);
  if (rgba) {
    const rgb = rgba[1];
    const a = rgba[2];
    if (!rgb || !a) throw new Error(`Invalid hex color: ${color}`);
    return [
      Number.parseInt(rgb.slice(0, 2), 16),
      Number.parseInt(rgb.slice(2, 4), 16),
      Number.parseInt(rgb.slice(4, 6), 16),
      Number.parseInt(a, 16),
    ];
  }
  const rgb = color.match(HEX_RGB)?.[1];
  if (!rgb) throw new Error(`Invalid hex color: ${color}`);
  return [
    Number.parseInt(rgb.slice(0, 2), 16),
    Number.parseInt(rgb.slice(2, 4), 16),
    Number.parseInt(rgb.slice(4, 6), 16),
    255,
  ];
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * A color in OKLCH: perceptual lightness (`0`-`1`), chroma (`0`-`~0.37`) and
 * hue in degrees.
 */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

function srgbToLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const v =
    channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/**
 * Convert `#rrggbb` to OKLCH. Unlike sRGB channels, OKLCH separates lightness
 * from hue and chroma, which is what makes it usable for "same weight,
 * different hue" panel colors.
 */
export function toOklch(color: string): Oklch {
  const [r, g, b] = toRgb(color).map(srgbToLinear) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return {
    l: L,
    c: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every((channel) => channel >= -0.0001 && channel <= 1.0001);
}

/**
 * Convert OKLCH back to `#rrggbb`. Chroma is reduced until the color fits in
 * sRGB instead of clipping channels, which would shift both hue and lightness.
 */
export function fromOklch(color: Oklch): string {
  let { c } = color;
  let linear = oklchToLinear(color);
  for (let i = 0; i < 32 && !inGamut(linear); i++) {
    c *= 0.94;
    linear = oklchToLinear({ ...color, c });
  }
  const [r, g, b] = linear.map(linearToSrgb) as [number, number, number];
  return toHex(r, g, b);
}

/**
 * Restate `base`'s lightness in the hue of `hue`, at a fixed chroma.
 *
 * This is the tool for panel backgrounds that must stay the same visual
 * weight as the neutral slot they replace while reading as a different color:
 * mixing two sRGB colors instead would drag lightness around by a dozen L
 * points, which is exactly what makes a tinted panel break its own text
 * contrast.
 */
export function rehue(
  base: string,
  hue: string,
  options: { chroma: number },
): string {
  const from = toOklch(base);
  const to = toOklch(hue);
  return fromOklch({ l: from.l, c: Math.min(options.chroma, to.c), h: to.h });
}

/**
 * Composite a (possibly transparent) foreground color over an opaque backdrop.
 * Returns a 6-digit `#rrggbb` string. If `fg` has no alpha it is returned
 * unchanged (only normalized to `#rrggbb`). If `bg` is omitted it defaults to
 * black, which is rarely what you want — pass the palette background.
 */
export function opaque(
  foreground: string,
  background: string = "#000000",
): string {
  const [fr, fg, fb, fa] = toRgb(foreground);
  const [br, bgg, bb, ba] = toRgb(background);

  const dstA = ba / 255;
  const srcA = fa / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return toHex(0, 0, 0);

  const blend = (s: number, d: number) =>
    Math.round((s * srcA + d * dstA * (1 - srcA)) / outA);

  return toHex(blend(fr, br), blend(fg, bgg), blend(fb, bb));
}
