import type { DebugGenerator } from "./types";
import { vscodeDebugGenerator } from "./vscode";
import { webstormDebugGenerator } from "./webstorm";

export type { DebugGenerator, GeneratedFile } from "./types";

/**
 * Order matters when auto-detecting: the first generator whose `detect()`
 * returns true wins when only one IDE is present in the project. When more
 * than one is present, the command prompts (or `--ide=all` covers both).
 */
export const DEBUG_GENERATORS: ReadonlyArray<DebugGenerator> = [
	vscodeDebugGenerator,
	webstormDebugGenerator,
];

export function getDebugGenerator(id: string): DebugGenerator | undefined {
	return DEBUG_GENERATORS.find((g) => g.id === id);
}
