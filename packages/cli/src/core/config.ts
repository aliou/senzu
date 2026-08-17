import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ZodIssue } from "zod";
import { configSchema, themeFamilySchema, themeIndexSchema } from "./schema";
import type { Config, Palette } from "./types";

export function loadConfig(configPath: string): Config {
  const stats = statSync(configPath);
  if (stats.isDirectory()) return loadConfigDirectory(configPath);

  const raw = readFileSync(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const result = configSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid config:\n${formatIssues(result.error.issues)}`);
  }

  return result.data as Config;
}

function loadConfigDirectory(configPath: string): Config {
  const indexPath = join(configPath, "index.json");
  const index = themeIndexSchema.safeParse(readJson(indexPath));
  if (!index.success) {
    throw new Error(
      `Invalid theme index ${indexPath}:\n${formatIssues(index.error.issues)}`,
    );
  }

  const discovered = new Map<string, Palette>();
  for (const fileName of readdirSync(configPath).sort()) {
    if (!fileName.endsWith(".json") || fileName === "index.json") continue;

    const familyPath = join(configPath, fileName);
    const family = themeFamilySchema.safeParse(readJson(familyPath));
    if (!family.success) {
      throw new Error(
        `Invalid theme family ${familyPath}:\n${formatIssues(family.error.issues)}`,
      );
    }

    for (const { key: variant, palette } of family.data.variants) {
      if (discovered.has(variant)) {
        throw new Error(`Duplicate theme variant ${variant} in ${familyPath}`);
      }
      discovered.set(variant, palette as Palette);
    }
  }

  const palettes = Object.create(null) as Record<string, Palette>;
  for (const variant of index.data.variants) {
    const palette = discovered.get(variant);
    if (!palette) throw new Error(`Theme index references missing ${variant}`);
    palettes[variant] = palette;
    discovered.delete(variant);
  }

  if (discovered.size > 0) {
    throw new Error(
      `Theme family files contain unindexed variants: ${Array.from(
        discovered.keys(),
      ).join(", ")}`,
    );
  }

  return {
    name: index.data.name,
    author: index.data.author,
    palettes,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function formatIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
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
