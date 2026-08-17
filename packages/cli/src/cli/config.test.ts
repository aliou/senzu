import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../core/config";

test("loadConfig loads theme families in manifest order", () => {
  const repoRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );
  const config = loadConfig(resolve(repoRoot, "themes"));

  assert.deepEqual(Object.keys(config.palettes), [
    "senzu",
    "senzu-mono",
    "senzu-light",
    "senzu-mono-light",
    "senzu-muted",
    "senzu-muted-light",
    "senzu-hc",
    "senzu-hc-light",
    "senzu-warm",
    "senzu-cold",
  ]);
});
