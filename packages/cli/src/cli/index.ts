import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getPalettes, loadConfig } from "../core/config";
import {
  getAllGenerators,
  getGenerator,
  getGeneratorNames,
} from "../generators";
import { runPreview } from "./preview";

interface Options {
  config: string;
  output: string;
}

/**
 * Resolve the @senzu/cli package.json by walking up from this module's
 * directory. Robust to both the source layout (packages/cli/src/cli/) and
 * the bundled layout (packages/cli/dist/), which sit at different depths.
 */
function readPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === "@senzu/cli") return pkg.version ?? "0.0.0";
    } catch {
      // not found here; keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "0.0.0";
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      config: { type: "string", short: "c", default: "./config.json" },
      output: { type: "string", short: "o", default: "." },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(readPackageVersion());
    process.exit(0);
  }

  if (values.help || positionals.length === 0) {
    printHelp();
    process.exit(0);
  }

  const [command, ...args] = positionals;
  const options: Options = {
    config: values.config as string,
    output: values.output as string,
  };

  try {
    switch (command) {
      case "generate":
        generate(args[0], options);
        break;
      case "list":
        list(options);
        break;
      case "install":
        install(args, options);
        break;
      case "preview":
        await preview(args[0], options);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

function generate(target: string | undefined, options: Options): void {
  const configPath = resolve(options.config);
  const config = loadConfig(configPath);
  const palettes = getPalettes(config);

  const generators = target
    ? (() => {
        const g = getGenerator(target);
        if (!g) {
          console.error(`Unknown target: ${target}`);
          console.error(`Available targets: ${getGeneratorNames().join(", ")}`);
          process.exit(1);
        }
        return [g];
      })()
    : getAllGenerators();

  let generated = 0;
  const outputDir = resolve(options.output);

  for (const generator of generators) {
    const files = generator.emit(palettes);
    for (const file of files) {
      const fullPath = join(outputDir, file.relativePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.contents);
      console.log(`Generated ${file.relativePath}`);
      generated++;
    }
  }

  console.log(`\n${generated} file(s) generated.`);
}

function list(options: Options): void {
  const configPath = resolve(options.config);
  const config = loadConfig(configPath);

  console.log("\nPalettes:");
  for (const [key, palette] of Object.entries(config.palettes)) {
    console.log(`  ${key} (${palette.appearance}) - ${palette.name}`);
  }

  console.log("\nTargets:");
  for (const g of getAllGenerators()) {
    console.log(`  ${g.name} - ${g.description}`);
  }

  console.log("");
}

async function preview(
  variant: string | undefined,
  options: Options,
): Promise<void> {
  const configPath = resolve(options.config);
  const config = loadConfig(configPath);
  const palettes = getPalettes(config);

  await runPreview(palettes, variant);
}

function install(args: string[], options: Options): void {
  if (args.length === 0) {
    console.error("Usage: senzu install <target> [variant] [--output <path>]");
    console.error("Targets: ghostty, wezterm, tmux, neovim, zed, pi");
    process.exit(1);
  }

  const target = args[0];
  if (!target) {
    console.error("Usage: senzu install <target> [variant] [--output <path>]");
    console.error("Targets: ghostty, wezterm, tmux, neovim, zed, pi");
    process.exit(1);
  }
  const variant = args[1] ?? "all";
  const outputFlag = args.indexOf("--output");
  const outputPath =
    outputFlag !== -1 && args[outputFlag + 1]
      ? resolve(args[outputFlag + 1] as string)
      : null;

  const configPath = resolve(options.config);
  const config = loadConfig(configPath);
  const allPalettes = getPalettes(config);

  const palettes =
    variant === "all"
      ? allPalettes
      : allPalettes.filter(
          (p) => p.name.toLowerCase().replace(/\s+/g, "-") === variant,
        );

  if (palettes.length === 0) {
    console.error(`No variant found matching: ${variant}`);
    process.exit(1);
  }

  const generator = getGenerator(target);
  if (!generator) {
    console.error(`Unknown target: ${target}`);
    console.error(`Available targets: ${getGeneratorNames().join(", ")}`);
    process.exit(1);
  }
  const destDir = outputPath ?? getDefaultInstallDir(target);
  const files = generator.emit(palettes);

  console.log(`Installing ${target} themes to ${destDir}`);
  for (const file of files) {
    const sourcePath = resolve(options.output, file.relativePath);
    const destPath = join(destDir, basename(file.relativePath));

    mkdirSync(dirname(destPath), { recursive: true });

    if (!existsSync(sourcePath)) {
      // Generate on the fly if not in share/
      mkdirSync(dirname(sourcePath), { recursive: true });
      writeFileSync(sourcePath, file.contents);
    }

    // Symlink for easy updates
    if (existsSync(destPath)) unlinkSync(destPath);
    symlinkSync(sourcePath, destPath);
    console.log(`  ${basename(file.relativePath)} -> ${destPath}`);
  }

  console.log(`\nInstalled ${files.length} file(s).`);
}

function getDefaultInstallDir(target: string): string {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  const xdgData = process.env.XDG_DATA_HOME ?? join(home, ".local", "share");

  switch (target) {
    case "ghostty":
      return join(xdgConfig, "ghostty", "themes");
    case "wezterm":
      return join(xdgConfig, "wezterm", "colors");
    case "tmux":
      return join(home, ".tmux", "themes", "senzu");
    case "neovim":
      return join(
        xdgData,
        "nvim",
        "site",
        "pack",
        "senzu",
        "opt",
        "senzu",
        "colors",
      );
    case "zed":
      return join(xdgConfig, "zed", "themes");
    case "pi":
      return join(xdgConfig, "pi", "themes");
    default:
      throw new Error(`No default install directory for target: ${target}`);
  }
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function printHelp(): void {
  console.log(`
senzu - canonical color scheme generator

Usage: senzu <command> [target] [options]

Commands:
  generate [target]           Generate theme files for all or a specific target
  list                        List available palettes and targets
  install <target> [variant]  Install themes (symlink) to default or custom path
  preview [variant]           Interactively preview a palette's colors in the terminal

Options:
  -c, --config <path>   Config file path (default: ./config.json)
  -o, --output <path>   Output directory (default: .)
  -h, --help            Show this help
  -v, --version         Show version

Targets:
  ${getGeneratorNames().join(", ")}

Examples:
  senzu generate                  Generate all targets into share/
  senzu generate ghostty           Generate only Ghostty themes
  senzu list                       List palettes and targets
  senzu install ghostty            Install all Ghostty variants to ~/.config/ghostty/themes/
  senzu install wezterm senzu-mono   Install one variant to ~/.config/wezterm/colors/
  senzu preview                    Interactively browse and preview palettes
  senzu preview senzu-hc-light     Preview a specific palette
`);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("An unknown error occurred");
  }
  process.exit(1);
});
