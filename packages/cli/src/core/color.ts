/**
 * Color helpers for sanitizing palette colors for targets that cannot consume
 * 8-digit hex (alpha) values.
 *
 * The canonical `config.json` is a Zed-format palette, where slots such as
 * `editor.active_line.background` legitimately store transparent colors like
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
