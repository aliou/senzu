import type { Generator } from "../core/types";
import { GhosttyGenerator } from "./ghostty";
import { NeovimGenerator } from "./neovim";
import { PiGenerator } from "./pi";
import { TmuxGenerator } from "./tmux";
import { WeztermGenerator } from "./wezterm";
import { ZedGenerator } from "./zed";

export { FamilyGenerator, PerPaletteGenerator } from "./base";
export { GhosttyGenerator } from "./ghostty";
export { NeovimGenerator } from "./neovim";
export { PiGenerator } from "./pi";
export { TmuxGenerator } from "./tmux";
export { WeztermGenerator } from "./wezterm";
export { ZedGenerator } from "./zed";

const generators: Map<string, Generator> = new Map();

for (const g of [
  new GhosttyGenerator(),
  new WeztermGenerator(),
  new TmuxGenerator(),
  new NeovimGenerator(),
  new ZedGenerator(),
  new PiGenerator(),
]) {
  generators.set(g.name, g);
}

export function getGenerator(name: string): Generator | undefined {
  return generators.get(name);
}

export function getAllGenerators(): Generator[] {
  return Array.from(generators.values());
}

export function getGeneratorNames(): string[] {
  return Array.from(generators.keys());
}
