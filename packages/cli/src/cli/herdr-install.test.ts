import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "@decimalturn/toml-patch";
import type { HerdrThemeConfig } from "../generators/herdr";
import { installHerdrTheme, mergeHerdrConfig } from "./herdr-install";

const theme: HerdrThemeConfig = {
  name: "catppuccin",
  auto_switch: false,
  custom: {
    accent: "#8fbfdc",
    text: "#e8e8d3",
    red: "#d74545",
  },
};

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "senzu-herdr-test-"));
}

test("mergeHerdrConfig preserves unrelated settings and theme keys", () => {
  const source = `# keep this comment
onboarding = false

[theme]
# keep this theme comment
name = "dracula"
auto_switch = true
future_option = "preserved"

[theme.custom]
accent = "#ffffff"
stale_color = "#000000"

[ui]
sidebar_width = 42
`;

  const output = mergeHerdrConfig(source, "config.toml", theme);
  const parsed = parse(output, { integersAsBigInt: false });

  assert.match(output, /# keep this comment/);
  assert.match(output, /# keep this theme comment/);
  assert.equal(parsed.onboarding, false);
  assert.equal(parsed.ui.sidebar_width, 42);
  assert.equal(parsed.theme.future_option, "preserved");
  assert.deepEqual({ ...parsed.theme.custom }, theme.custom);
  assert.doesNotMatch(output, /stale_color/);
});

test("installHerdrTheme creates a timestamped backup and is idempotent", () => {
  const root = temporaryDirectory();
  const configPath = join(root, "config.toml");
  const source = "[ui]\nsidebar_width = 32\n";
  writeFileSync(configPath, source);

  try {
    const first = installHerdrTheme({
      configPath,
      theme,
      force: false,
      dryRun: false,
      now: new Date("2026-07-23T08:15:00.000Z"),
    });

    assert.equal(first.status, "updated");
    assert.equal(
      first.backupPath,
      `${configPath}.senzu-backup-20260723T081500Z`,
    );
    assert.equal(readFileSync(first.backupPath, "utf8"), source);

    const second = installHerdrTheme({
      configPath,
      theme,
      force: false,
      dryRun: false,
    });
    assert.equal(second.status, "unchanged");
    assert.equal(second.backupPath, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installHerdrTheme creates a missing config without a backup", () => {
  const root = temporaryDirectory();
  const configPath = join(root, "nested", "config.toml");

  try {
    const result = installHerdrTheme({
      configPath,
      theme,
      force: false,
      dryRun: false,
    });

    assert.equal(result.status, "updated");
    assert.equal(result.backupPath, undefined);
    assert.equal(
      parse(readFileSync(configPath, "utf8")).theme.name,
      theme.name,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installHerdrTheme refuses symlinks unless forced", () => {
  const root = temporaryDirectory();
  const targetPath = join(root, "managed-config.toml");
  const configPath = join(root, "config.toml");
  const source = '[theme]\nname = "nord"\n';
  writeFileSync(targetPath, source);
  symlinkSync(targetPath, configPath);

  try {
    assert.throws(
      () =>
        installHerdrTheme({
          configPath,
          theme,
          force: false,
          dryRun: false,
        }),
      /Refusing to update symlink/,
    );
    assert.equal(readFileSync(targetPath, "utf8"), source);

    const dryRun = installHerdrTheme({
      configPath,
      theme,
      force: false,
      dryRun: true,
    });
    assert.equal(dryRun.status, "dry-run");
    assert.equal(readFileSync(targetPath, "utf8"), source);

    const forced = installHerdrTheme({
      configPath,
      theme,
      force: true,
      dryRun: false,
      now: new Date("2026-07-23T08:15:00.000Z"),
    });
    assert.equal(forced.status, "updated");
    assert.equal(lstatSync(configPath).isSymbolicLink(), true);
    assert.equal(
      parse(readFileSync(targetPath, "utf8")).theme.name,
      theme.name,
    );
    assert.ok(forced.backupPath);
    assert.equal(existsSync(forced.backupPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installHerdrTheme rejects invalid TOML without writing", () => {
  const root = temporaryDirectory();
  const configPath = join(root, "config.toml");
  const source = "[theme\nname = broken\n";
  writeFileSync(configPath, source);

  try {
    assert.throws(
      () =>
        installHerdrTheme({
          configPath,
          theme,
          force: false,
          dryRun: false,
        }),
      /Cannot update invalid TOML/,
    );
    assert.equal(readFileSync(configPath, "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installHerdrTheme respects an existing update lock", () => {
  const root = temporaryDirectory();
  const configPath = join(root, "config.toml");
  const lockPath = `${configPath}.senzu-lock`;
  writeFileSync(configPath, '[theme]\nname = "nord"\n');
  writeFileSync(lockPath, "1234\n");

  try {
    assert.throws(
      () =>
        installHerdrTheme({
          configPath,
          theme,
          force: false,
          dryRun: false,
        }),
      /Another Senzu process is updating/,
    );
    assert.equal(readFileSync(lockPath, "utf8"), "1234\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installHerdrTheme refuses direct Nix store paths", () => {
  assert.throws(
    () =>
      installHerdrTheme({
        configPath: "/nix/store/example-herdr-config.toml",
        theme,
        force: true,
        dryRun: false,
      }),
    /Cannot update Nix store path/,
  );
});
