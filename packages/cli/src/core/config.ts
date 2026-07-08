import { readFileSync } from "node:fs";
import { configSchema } from "./schema";
import type { Config, Palette } from "./types";

export function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const result = configSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${errors}`);
  }

  return result.data as Config;
}

export function getPalettes(config: Config): Palette[] {
  return Object.values(config.palettes);
}

/**
 * Palettes ordered as dark/light pairs for display: Senzu, Senzu Light,
 * Senzu Mono, Senzu Mono Light, ... Lights that have no dark counterpart
 * (or unmatched darks) are appended at the end in declaration order.
 * Does NOT affect generation output (generate uses getPalettes).
 */
export function getPalettesOrdered(config: Config): Palette[] {
  const entries = Object.entries(config.palettes);
  const byKey = new Map(entries);
  const ordered: Palette[] = [];
  const seen = new Set<string>();

  for (const [key, palette] of entries) {
    if (seen.has(key)) continue;
    // Skip if this is a light variant already consumed as a pair.
    if (key.endsWith("-light")) {
      const darkKey = key.slice(0, -"-light".length);
      if (byKey.has(darkKey)) continue;
    }
    ordered.push(palette);
    seen.add(key);
    const lightKey = `${key}-light`;
    const light = byKey.get(lightKey);
    if (light) {
      ordered.push(light);
      seen.add(lightKey);
    }
  }

  // Append any leftovers (e.g. unmatched lights) in declaration order.
  for (const [key, palette] of entries) {
    if (!seen.has(key)) {
      ordered.push(palette);
      seen.add(key);
    }
  }

  return ordered;
}
