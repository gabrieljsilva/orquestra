import { globSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_TEST_MATCH = ["**/*.feature.ts"];

export interface DiscoveryOptions {
	testMatch?: string[];
	configDir: string;
	filter?: string;
}

function isInsideNodeModules(path: string): boolean {
	// Only exclude when "node_modules" is an exact path segment, otherwise
	// directories named e.g. `node_modules_archive/` get wrongly skipped.
	const segments = path.split(/[/\\]/);
	return segments.includes("node_modules");
}

function compileFilter(raw: string): (file: string) => boolean {
	// Allow `--filter /pattern/flags` for regex matches.
	const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
	if (match) {
		const [, body, flags] = match;
		const re = new RegExp(body, flags);
		return (file) => re.test(file);
	}
	const lower = raw.toLowerCase();
	return (file) => file.toLowerCase().includes(lower);
}

export function discoverFeatureFiles(options: DiscoveryOptions): string[] {
	const patterns = options.testMatch ?? DEFAULT_TEST_MATCH;

	const files = patterns.flatMap((pattern) =>
		globSync(pattern, {
			cwd: options.configDir,
			exclude: (p) => isInsideNodeModules(p),
		}).map((file) => resolve(options.configDir, file)),
	);

	const unique = [...new Set(files)].sort();

	if (!options.filter) return unique;

	const matches = compileFilter(options.filter);
	return unique.filter(matches);
}

// Exposed for tests.
export const _discovery = { isInsideNodeModules, compileFilter };
