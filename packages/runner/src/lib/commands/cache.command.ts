import { existsSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineCommand } from "citty";

/**
 * Locations Orquestra writes to or relies on for transpile cache. Kept as a
 * data-driven list so adding a new cache type later is a one-line change.
 */
interface CacheTarget {
	id: string;
	relativePath: string;
	description: string;
}

const CACHE_TARGETS: ReadonlyArray<CacheTarget> = [
	{
		id: "jiti",
		relativePath: "node_modules/.cache/jiti",
		description: "SWC transpile cache (jiti). Holds JS for every .ts the runner has imported.",
	},
];

const clearSubcommand = defineCommand({
	meta: {
		name: "clear",
		description: "Wipe the transpile caches Orquestra writes (jiti). Safe to run anytime.",
	},
	args: {
		dryRun: {
			type: "boolean",
			description: "Print what would be removed without deleting anything.",
			default: false,
		},
	},
	async run({ args }) {
		const cwd = process.cwd();
		let removedCount = 0;
		let totalBytes = 0;

		for (const target of CACHE_TARGETS) {
			const absPath = resolve(cwd, target.relativePath);
			if (!existsSync(absPath)) {
				console.log(`[orquestra] ${target.id.padEnd(8)} not present (${target.relativePath})`);
				continue;
			}

			const sizeBytes = directorySizeBytes(absPath);
			const sizeLabel = formatBytes(sizeBytes);

			if (args.dryRun) {
				console.log(`[orquestra] ${target.id.padEnd(8)} would remove ${sizeLabel.padStart(8)}  ${target.relativePath}`);
				continue;
			}

			rmSync(absPath, { recursive: true, force: true });
			console.log(`[orquestra] ${target.id.padEnd(8)} removed     ${sizeLabel.padStart(8)}  ${target.relativePath}`);
			removedCount += 1;
			totalBytes += sizeBytes;
		}

		if (!args.dryRun && removedCount > 0) {
			console.log(`\n[orquestra] freed ${formatBytes(totalBytes)} across ${removedCount} cache(s).`);
		}
	},
});

function directorySizeBytes(path: string): number {
	// Walk the tree summing file sizes. Cheap enough for caches that rarely
	// exceed a few hundred MB; if it ever becomes a hot path, swap for a
	// readdirSync recursion that bails early.
	let total = 0;
	const stack: string[] = [path];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		const stat = statSync(current);
		if (stat.isDirectory()) {
			for (const entry of readDir(current)) stack.push(join(current, entry));
		} else {
			total += stat.size;
		}
	}
	return total;
}

function readDir(path: string): string[] {
	// Inline import to keep the dependency surface explicit at the top of the
	// file; readdirSync is the only fs call we need beyond rm + stat.
	const { readdirSync } = require("node:fs") as typeof import("node:fs");
	return readdirSync(path);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

export const cacheCommand = defineCommand({
	meta: {
		name: "cache",
		description: "Inspect or clear Orquestra transpile caches",
	},
	subCommands: {
		clear: clearSubcommand,
	},
});
