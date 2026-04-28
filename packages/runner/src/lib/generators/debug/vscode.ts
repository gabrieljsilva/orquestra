import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DebugGenerator, GeneratedFile } from "./types";

interface LaunchConfig {
	type: string;
	request: string;
	name: string;
	[k: string]: unknown;
}

interface LaunchFile {
	version?: string;
	configurations?: LaunchConfig[];
	[k: string]: unknown;
}

/**
 * Two configurations are emitted:
 *  - "Orquestra: debug all features" runs the whole suite under --debug.
 *  - "Orquestra: debug current feature" filters by the basename of the file
 *    open in the editor — F5 from a `.feature.ts` debugs that one file.
 *
 * `autoAttachChildProcesses: true` is the magic that makes VS Code follow
 * the `fork()` from the manager into the worker, where the breakpoints
 * actually live.
 */
function buildConfigs(): LaunchConfig[] {
	return [
		{
			type: "node",
			request: "launch",
			name: "Orquestra: debug all features",
			runtimeExecutable: "${workspaceFolder}/node_modules/.bin/orquestra",
			args: ["test", "--debug"],
			console: "integratedTerminal",
			skipFiles: ["<node_internals>/**", "**/node_modules/**"],
			autoAttachChildProcesses: true,
			sourceMaps: true,
		},
		{
			type: "node",
			request: "launch",
			name: "Orquestra: debug current feature",
			runtimeExecutable: "${workspaceFolder}/node_modules/.bin/orquestra",
			args: ["test", "--debug", "${fileBasenameNoExtension}"],
			console: "integratedTerminal",
			skipFiles: ["<node_internals>/**", "**/node_modules/**"],
			autoAttachChildProcesses: true,
			sourceMaps: true,
		},
	];
}

function buildFresh(): string {
	const file: LaunchFile = {
		version: "0.2.0",
		configurations: buildConfigs(),
	};
	return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Tolerant parse of a launch.json the user may already have. VS Code accepts
 * single-line `//` comments and trailing commas (`jsonc`). We strip them so
 * `JSON.parse` works without bringing a dep in. Side benefit: the original
 * file's comments survive — we only replace the configurations array with
 * a merged version, then re-serialize as plain JSON.
 *
 * NOTE: we deliberately re-emit plain JSON (no comments) on merge. Keeping
 * the original comments would require a real CST-preserving parser. The
 * trade-off: users who care about comments use `--print` and integrate
 * manually; the common case is "no existing launch.json or only ours".
 */
function stripJsoncComments(src: string): string {
	// Remove block comments first, then line comments. Strings are not
	// fully respected, but launch.json values rarely embed `//` or `/*`.
	const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
	const noLine = noBlock.replace(/(^|[^:])\/\/[^\n\r]*/g, "$1");
	// Trailing commas before `]`/`}` — `JSON.parse` rejects them.
	return noLine.replace(/,(\s*[}\]])/g, "$1");
}

function tryParse(src: string): LaunchFile | null {
	try {
		return JSON.parse(stripJsoncComments(src)) as LaunchFile;
	} catch {
		return null;
	}
}

function mergeLaunchJson(existing: string, _generated: string): string {
	const parsed = tryParse(existing);
	if (!parsed) {
		// Existing file is broken or non-JSON — bail and let the command
		// surface the conflict so the user decides (`--force` overrides).
		throw new Error(
			"Existing .vscode/launch.json could not be parsed (even tolerantly). " +
				"Fix the syntax or pass --force to overwrite it.",
		);
	}

	const ours = buildConfigs();
	const existingConfigs = Array.isArray(parsed.configurations) ? parsed.configurations : [];

	const ourNames = new Set(ours.map((c) => c.name));
	const kept = existingConfigs.filter((c) => !ourNames.has(c.name));

	parsed.version = parsed.version ?? "0.2.0";
	parsed.configurations = [...kept, ...ours];

	return `${JSON.stringify(parsed, null, 2)}\n`;
}

export const vscodeDebugGenerator: DebugGenerator = {
	id: "vscode",
	displayName: "VS Code",
	detect(cwd) {
		return existsSync(join(cwd, ".vscode"));
	},
	files(_cwd): GeneratedFile[] {
		return [{ relativePath: ".vscode/launch.json", content: buildFresh() }];
	},
	merge: mergeLaunchJson,
};
