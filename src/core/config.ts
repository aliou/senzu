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
