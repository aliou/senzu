import type { Palette } from "./types";

/**
 * Accessors for `palette.ui` slot colors.
 *
 * The config schema uses dotted UI keys (e.g. `surface.background`,
 * `editor.active_line.background`, `text.placeholder`). These helpers resolve
 * the canonical key first and fall back to sensible alternates so that
 * light and dark variants both render correctly. Previously generators reached
 * for non-existent short keys (`ui.surface`, `ui.text_muted`, ...) which left
 * every theme on a dark `#1c1c1c` fallback — invisible on light backgrounds.
 */
export function surface(p: Palette): string {
  return (
    p.ui["surface.background"] ??
    p.ui["elevated_surface.background"] ??
    p.background
  );
}

export function elevatedSurface(p: Palette): string {
  return (
    p.ui["elevated_surface.background"] ??
    p.ui["surface.background"] ??
    p.background
  );
}

export function activeLine(p: Palette): string {
  return (
    p.ui["editor.active_line.background"] ??
    p.ui["editor.highlighted_line.background"] ??
    surface(p)
  );
}

export function lineNumber(p: Palette): string {
  return p.ui["editor.line_number"] ?? p.colors.zambezi ?? "#605958";
}

export function activeLineNumber(p: Palette): string {
  return p.ui["editor.active_line_number"] ?? p.foreground;
}

export function textMuted(p: Palette): string {
  return (
    p.ui["text.placeholder"] ??
    p.ui["text.disabled"] ??
    p.colors.zambezi ??
    "#888888"
  );
}

export function textAccent(p: Palette): string {
  return p.ui["element.active"] ?? p.ui["border.focused"] ?? p.ansi.cyan;
}

export function tabBar(p: Palette): string {
  return p.ui["tab_bar.background"] ?? p.background;
}

export function border(p: Palette): string {
  return p.ui.border ?? p.colors.tundora ?? "#404040";
}

export function elementHover(p: Palette): string {
  return (
    p.ui["element.hover"] ??
    p.ui["element.selected"] ??
    p.colors.tundora ??
    "#404040"
  );
}

export function scrollbarThumb(p: Palette): string {
  return (
    p.ui["scrollbar.thumb.background"] ??
    p.ui["scrollbar.thumb.hover_background"] ??
    border(p)
  );
}
