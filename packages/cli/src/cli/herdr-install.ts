import { randomUUID } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parse, patch, stringify } from "@decimalturn/toml-patch";
import * as lockfile from "proper-lockfile";
import type { HerdrThemeConfig } from "../generators/herdr";

type TomlObject = Record<string, unknown>;

export interface InstallHerdrOptions {
  configPath: string;
  theme: HerdrThemeConfig;
  force: boolean;
  dryRun: boolean;
  now?: Date;
}

export interface InstallHerdrResult {
  status: "updated" | "unchanged" | "dry-run";
  requestedPath: string;
  effectivePath: string;
  symlink: boolean;
  backupPath?: string;
  contents: string;
}

function isTomlObject(value: unknown): value is TomlObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfig(source: string, path: string): TomlObject {
  if (source.trim() === "") return {};

  try {
    const parsed = parse(source, { integersAsBigInt: false });
    if (!isTomlObject(parsed)) throw new Error("root must be a table");
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot update invalid TOML at ${path}: ${message}`);
  }
}

export function mergeHerdrConfig(
  source: string,
  path: string,
  theme: HerdrThemeConfig,
): string {
  const config = parseConfig(source, path);
  const currentTheme = config.theme;

  if (currentTheme !== undefined && !isTomlObject(currentTheme)) {
    throw new Error(`Cannot update ${path}: theme must be a TOML table`);
  }

  const updated: TomlObject = {
    ...config,
    theme: {
      ...(currentTheme ?? {}),
      name: theme.name,
      auto_switch: theme.auto_switch,
      custom: { ...theme.custom },
    },
  };

  const newLine = source.includes("\r\n") ? "\r\n" : "\n";
  const format = { inlineTableStart: 2, newLine };
  let output: string;
  if (currentTheme === undefined) {
    const themeDocument = stringify({ theme: updated.theme }, format);
    output =
      source.trim() === ""
        ? themeDocument
        : `${source.replace(/\s*$/, "")}${newLine}${newLine}${themeDocument}`;
  } else {
    output = patch(source, updated, format);
  }
  const verified = parseConfig(output, path);
  const verifiedTheme = verified.theme;

  if (!isTomlObject(verifiedTheme)) {
    throw new Error(`Generated invalid Herdr theme for ${path}`);
  }
  if (
    verifiedTheme.name !== theme.name ||
    verifiedTheme.auto_switch !== theme.auto_switch ||
    !isTomlObject(verifiedTheme.custom)
  ) {
    throw new Error(`Generated Herdr theme failed validation for ${path}`);
  }
  if (
    Object.keys(verifiedTheme.custom).length !==
    Object.keys(theme.custom).length
  ) {
    throw new Error(
      `Generated Herdr custom colors failed validation for ${path}`,
    );
  }
  for (const [name, color] of Object.entries(theme.custom)) {
    if (verifiedTheme.custom[name] !== color) {
      throw new Error(`Generated Herdr color ${name} failed validation`);
    }
  }

  return output;
}

export function resolveHerdrConfigPath(): string {
  const configured = process.env.HERDR_CONFIG_PATH;
  if (configured) return resolve(configured);

  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return resolve(xdgConfig, "herdr", "config.toml");
}

function timestamp(date: Date): string {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

function nextBackupPath(path: string, now: Date): string {
  const base = `${path}.senzu-backup-${timestamp(now)}`;
  if (!existsSync(base)) return base;

  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function assertSourceUnchanged(
  path: string,
  existed: boolean,
  source: string,
): void {
  if (!existed) {
    if (existsSync(path)) {
      throw new Error(`Herdr config changed while updating: ${path}`);
    }
    return;
  }

  if (!existsSync(path) || readFileSync(path, "utf8") !== source) {
    throw new Error(`Herdr config changed while updating: ${path}`);
  }
}

function atomicWrite(
  path: string,
  contents: string,
  mode: number,
  beforeRename: () => void,
): void {
  const tempPath = join(
    dirname(path),
    `.${basename(path)}.senzu-tmp-${process.pid}-${randomUUID()}`,
  );
  let descriptor: number | undefined;

  try {
    descriptor = openSync(
      tempPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      mode,
    );
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    beforeRename();
    renameSync(tempPath, path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }
}

function acquireUpdateLock(path: string): () => void {
  const lockPath = `${path}.senzu-lock`;

  try {
    return lockfile.lockSync(path, {
      lockfilePath: lockPath,
      realpath: false,
      stale: 30_000,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new Error(
        `Another Senzu process is updating ${path}. Retry after it finishes.`,
      );
    }
    throw error;
  }
}

export function installHerdrTheme(
  options: InstallHerdrOptions,
): InstallHerdrResult {
  const requestedPath = resolve(options.configPath);
  let effectivePath = requestedPath;
  let symlink = false;

  try {
    symlink = lstatSync(requestedPath).isSymbolicLink();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  if (symlink) {
    effectivePath = realpathSync(requestedPath);
    if (!options.dryRun && !options.force) {
      throw new Error(
        `Refusing to update symlink ${requestedPath} -> ${effectivePath}. ` +
          "Run again with --force to update its target.",
      );
    }
    if (!options.dryRun && options.force) {
      try {
        accessSync(dirname(effectivePath), constants.W_OK);
      } catch {
        throw new Error(
          `Symlink target directory is not writable: ${dirname(effectivePath)}`,
        );
      }
    }
  }

  if (
    !options.dryRun &&
    (effectivePath === "/nix/store" || effectivePath.startsWith("/nix/store/"))
  ) {
    throw new Error(
      `Cannot update Nix store path ${effectivePath}. ` +
        'Use inputs.senzu.lib.herdrTheme "<variant>" in your Nix config.',
    );
  }

  if (!options.dryRun && existsSync(effectivePath)) {
    try {
      accessSync(effectivePath, constants.W_OK);
    } catch {
      throw new Error(`Herdr config is not writable: ${effectivePath}`);
    }
  }

  if (options.dryRun) {
    const source = existsSync(effectivePath)
      ? readFileSync(effectivePath, "utf8")
      : "";
    const contents = mergeHerdrConfig(source, effectivePath, options.theme);
    return {
      status: contents === source ? "unchanged" : "dry-run",
      requestedPath,
      effectivePath,
      symlink,
      contents,
    };
  }

  mkdirSync(dirname(effectivePath), { recursive: true });
  const releaseLock = acquireUpdateLock(effectivePath);

  try {
    const existed = existsSync(effectivePath);
    const source = existed ? readFileSync(effectivePath, "utf8") : "";
    const contents = mergeHerdrConfig(source, effectivePath, options.theme);

    if (contents === source) {
      return {
        status: "unchanged",
        requestedPath,
        effectivePath,
        symlink,
        contents,
      };
    }

    assertSourceUnchanged(effectivePath, existed, source);

    let backupPath: string | undefined;
    if (existed) {
      backupPath = nextBackupPath(effectivePath, options.now ?? new Date());
      copyFileSync(effectivePath, backupPath, constants.COPYFILE_EXCL);
    }

    const mode = existed ? statSync(effectivePath).mode & 0o777 : 0o600;
    assertSourceUnchanged(effectivePath, existed, source);
    atomicWrite(effectivePath, contents, mode, () =>
      assertSourceUnchanged(effectivePath, existed, source),
    );

    return {
      status: "updated",
      requestedPath,
      effectivePath,
      symlink,
      backupPath,
      contents,
    };
  } finally {
    releaseLock();
  }
}
