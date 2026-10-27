import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { toOklch } from "../core/color";
import { loadConfig } from "../core/config";
import type { Palette } from "../core/types";
import { PiGenerator } from "../generators/pi";

/**
 * Guards the pi theme's message vs. tool panels.
 *
 * A user message and a successful tool call are both full-width background
 * blocks, so they have to be tellable apart at a glance while scrolling. That
 * means a hue gap, not just a lightness gap: neutral greys of similar
 * lightness read as the same box. These tests fail if a future palette edit
 * collapses the panels back into each other, or if a panel tint makes text on
 * it unreadable.
 */

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function generated(palette: Palette): {
  colors: Record<string, string>;
  vars: Record<string, string>;
} {
  const theme = JSON.parse(new PiGenerator().generate(palette));
  const vars: Record<string, string> = theme.vars;
  const resolveVar = (value: string): string => {
    let current: string | undefined = value;
    for (let i = 0; i < 8 && current !== undefined && current in vars; i++) {
      current = vars[current];
    }
    return current as string;
  };
  const colors: Record<string, string> = {};
  for (const [slot, value] of Object.entries(theme.colors)) {
    colors[slot] = resolveVar(value as string);
  }
  return { colors, vars };
}

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const h = hex.replace("#", "").slice(0, 6);
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function lab(hex: string): [number, number, number] {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(channel) as Rgb;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number =>
    t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 distance — good enough to answer "are these two blocks different?". */
function distance(a: string, b: string): number {
  const [la, aa, ba] = lab(a);
  const [lb, ab, bb] = lab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

function hue(hex: string): number {
  const [, a, b] = lab(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}

function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

const config = loadConfig(resolve(repoRoot, "themes"));
const palettes = Object.values(config.palettes);

test("user and tool-success panels are distinguishable in every variant", () => {
  for (const palette of palettes) {
    const { colors } = generated(palette);
    const user = colors.userMessageBg as string;
    const tool = colors.toolSuccessBg as string;
    const custom = colors.customMessageBg as string;

    assert.ok(
      distance(user, tool) >= 11,
      `${palette.name}: userMessageBg ${user} and toolSuccessBg ${tool} are too close (dE ${distance(user, tool).toFixed(1)})`,
    );
    assert.ok(
      hueGap(user, tool) >= 90,
      `${palette.name}: userMessageBg ${user} and toolSuccessBg ${tool} differ in lightness only (hue gap ${hueGap(user, tool).toFixed(0)}°)`,
    );
    // Monochrome families grey out their ansi colors, so the custom panel's
    // hue source is neutral there and it intentionally stays lightness-only.
    const customHasHue = toOklch(palette.ansi.magenta).c >= 0.05;
    if (customHasHue) {
      assert.ok(
        distance(user, custom) >= 6,
        `${palette.name}: userMessageBg ${user} and customMessageBg ${custom} are too close (dE ${distance(user, custom).toFixed(1)})`,
      );
    }
  }
});

test("panels stay distinct from the page background", () => {
  for (const palette of palettes) {
    const { colors } = generated(palette);
    for (const slot of [
      "userMessageBg",
      "customMessageBg",
      "toolSuccessBg",
    ] as const) {
      const panel = colors[slot] as string;
      assert.ok(
        distance(panel, palette.background) >= 6,
        `${palette.name}: ${slot} ${panel} blends into the page background ${palette.background} (dE ${distance(panel, palette.background).toFixed(1)})`,
      );
    }
  }
});

test("panels keep the visual weight of the neutral slot they replace", () => {
  // Hue must do the distinguishing work. A panel that also jumps a dozen
  // lightness points drags the text contrast it was tuned for along with it.
  for (const palette of palettes) {
    const { colors } = generated(palette);
    const slots: Array<[string, string]> = [
      ["userMessageBg", "grey_three"],
      ["customMessageBg", "gravel"],
      ["toolSuccessBg", "gravel"],
    ];
    for (const [slot, source] of slots) {
      const neutral = palette.colors[source];
      if (!neutral) continue;
      const delta = Math.abs(
        toOklch(colors[slot] as string).l - toOklch(neutral).l,
      );
      assert.ok(
        delta <= 0.07,
        `${palette.name}: ${slot} ${colors[slot]} moved ${delta.toFixed(3)} in OKLCH lightness away from ${source} ${neutral}`,
      );
    }
  }
});

test("text on message and tool panels is no dimmer than on the neutral slot", () => {
  // The panels changed hue, not weight, so the invariant is relative: every
  // token must read at least as well as it did on the neutral grey the panel
  // replaced (grey_three / gravel). Absolute contrast is the palettes' own
  // business — Senzu Mono and Senzu Muted already sit below AA for some
  // secondary tokens, and that predates this mapping.
  const neutralFor: Record<string, string> = {
    userMessageBg: "grey_three",
    customMessageBg: "gravel",
    toolSuccessBg: "gravel",
    toolPendingBg: "mine_shaft",
  };
  const tokens = [
    "userMessageText",
    "customMessageText",
    "customMessageLabel",
    "toolTitle",
    "toolOutput",
    "muted",
    "mdHeading",
    "mdLink",
    "mdQuote",
    "mdListBullet",
    "mdCodeBlock",
    "syntaxKeyword",
    "syntaxFunction",
    "syntaxString",
    "syntaxNumber",
    "syntaxType",
    "syntaxVariable",
  ] as const;
  // Anything above this pair is body-weight text and must stay crisp.
  const crisp = new Set(["userMessageText", "customMessageText", "toolOutput"]);

  for (const palette of palettes) {
    const { colors } = generated(palette);
    for (const [panel, neutralKey] of Object.entries(neutralFor)) {
      const neutral = palette.colors[neutralKey];
      assert.ok(
        neutral,
        `${palette.name}: palette has no colors.${neutralKey}`,
      );
      const bg = colors[panel] as string;
      for (const token of tokens) {
        const fg = colors[token] as string;
        const before = contrast(fg, neutral as string);
        const after = contrast(fg, bg);
        assert.ok(
          after >= before - 0.35,
          `${palette.name}: ${token} ${fg} dropped from ${before.toFixed(2)}:1 on ${neutralKey} to ${after.toFixed(2)}:1 on ${panel} ${bg}`,
        );
        if (crisp.has(token)) {
          assert.ok(
            after >= 7,
            `${palette.name}: ${token} ${fg} on ${panel} ${bg} is ${after.toFixed(2)}:1, want 7:1`,
          );
        }
      }
    }
  }
});
