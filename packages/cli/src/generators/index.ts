import type { Generator } from "../core/types";
import { BatGenerator } from "./bat";
import { FzfGenerator } from "./fzf";
import { GhosttyGenerator } from "./ghostty";
import { NeovimGenerator } from "./neovim";
import { PiGenerator } from "./pi";
import { TextMateGenerator } from "./textmate";
import { TmuxGenerator } from "./tmux";
import { WeztermGenerator } from "./wezterm";
import { WtermGenerator } from "./wterm";
import { ZedGenerator } from "./zed";

export { FamilyGenerator, PerPaletteGenerator } from "./base";
export { BatGenerator } from "./bat";
export { FzfGenerator } from "./fzf";
export { GhosttyGenerator } from "./ghostty";
export { NeovimGenerator } from "./neovim";
export { PiGenerator } from "./pi";
export { TextMateGenerator } from "./textmate";
export { TmuxGenerator } from "./tmux";
export { WeztermGenerator } from "./wezterm";
export { WtermGenerator } from "./wterm";
export { ZedGenerator } from "./zed";

const generators: Map<string, Generator> = new Map();

for (const g of [
  new GhosttyGenerator(),
  new WeztermGenerator(),
  new WtermGenerator(),
  new TmuxGenerator(),
  new NeovimGenerator(),
  new ZedGenerator(),
  new PiGenerator(),
  new TextMateGenerator(),
  new BatGenerator(),
  new FzfGenerator(),
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
