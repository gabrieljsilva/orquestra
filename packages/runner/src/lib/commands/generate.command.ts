import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineCommand } from "citty";
import { DEBUG_GENERATORS, type DebugGenerator, getDebugGenerator } from "../generators/debug";

const debugSubcommand = defineCommand({
	meta: {
		name: "debug",
		description: "Generate IDE launch configuration for orquestra debug runs",
	},
	args: {
		ide: {
			type: "string",
			description:
				"Target IDE: vscode, webstorm, or all. Auto-detects from .vscode/ or .idea/ when omitted.",
		},
		force: {
			type: "boolean",
			description: "Overwrite existing files instead of merging or skipping.",
			default: false,
		},
		print: {
			type: "boolean",
			description: "Print generated content to stdout without writing to disk.",
			default: false,
		},
	},
	async run({ args }) {
		const cwd = process.cwd();
		const targets = resolveTargets(cwd, args.ide);
		if (targets.length === 0) {
			console.error(
				"[orquestra] No IDE detected (.vscode/ and .idea/ both missing) and no --ide given.\n" +
					"           Pass --ide=vscode or --ide=webstorm explicitly.",
			);
			process.exitCode = 1;
			return;
		}

		const force = args.force;
		const printOnly = args.print;

		for (const generator of targets) {
			console.log(`[orquestra] ${generator.displayName}`);
			for (const file of generator.files(cwd)) {
				const absPath = resolve(cwd, file.relativePath);

				if (printOnly) {
					console.log(`# ${file.relativePath}`);
					console.log(file.content);
					continue;
				}

				const result = applyFile(absPath, file.content, generator, force);
				switch (result.action) {
					case "created":
						console.log(`  + wrote     ${file.relativePath}`);
						break;
					case "merged":
						console.log(`  ~ merged    ${file.relativePath}`);
						break;
					case "unchanged":
						console.log(`  · unchanged ${file.relativePath} (already up to date)`);
						break;
					case "skipped":
						console.log(
							`  · skip      ${file.relativePath} (exists, no merge available — pass --force to overwrite)`,
						);
						break;
					case "overwritten":
						console.log(`  ! force     ${file.relativePath}`);
						break;
				}
			}
		}

		if (!printOnly) {
			console.log(
				"\n[orquestra] Done. Open a `.feature.ts` and start a debug run from your IDE — " +
					"the launch config invokes `orquestra test --debug` for you.",
			);
		}
	},
});

interface ApplyResult {
	action: "created" | "merged" | "unchanged" | "skipped" | "overwritten";
}

function applyFile(absPath: string, content: string, generator: DebugGenerator, force: boolean): ApplyResult {
	if (!existsSync(absPath)) {
		mkdirSync(dirname(absPath), { recursive: true });
		writeFileSync(absPath, content);
		return { action: "created" };
	}

	if (force) {
		writeFileSync(absPath, content);
		return { action: "overwritten" };
	}

	if (generator.merge) {
		const existing = readFileSync(absPath, "utf8");
		const merged = generator.merge(existing, content);
		// Avoid touching mtime if nothing changed — keeps git/IDE diffs clean.
		if (merged === existing) return { action: "unchanged" };
		writeFileSync(absPath, merged);
		return { action: "merged" };
	}

	return { action: "skipped" };
}

function resolveTargets(cwd: string, ide: string | undefined): DebugGenerator[] {
	if (ide === "all") return [...DEBUG_GENERATORS];

	if (ide) {
		const found = getDebugGenerator(ide);
		if (!found) {
			const known = DEBUG_GENERATORS.map((g) => g.id).join(", ");
			throw new Error(`Unknown --ide=${ide}. Known: ${known}, all.`);
		}
		return [found];
	}

	// Auto-detect: every generator whose project markers exist on disk.
	const detected = DEBUG_GENERATORS.filter((g) => g.detect(cwd));
	return detected;
}

export const generateCommand = defineCommand({
	meta: {
		name: "generate",
		description: "Generate boilerplate (IDE configs, etc.)",
	},
	subCommands: {
		debug: debugSubcommand,
	},
});
