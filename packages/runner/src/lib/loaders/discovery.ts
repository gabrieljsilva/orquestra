import { globSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_TEST_MATCH = ["**/*.feature.ts"];

export interface DiscoveryOptions {
	testMatch?: string[];
	configDir: string;
	filter?: string;
}

export function discoverFeatureFiles(options: DiscoveryOptions): string[] {
	const patterns = options.testMatch ?? DEFAULT_TEST_MATCH;

	const files = patterns.flatMap((pattern) =>
		globSync(pattern, {
			cwd: options.configDir,
			exclude: (p) => p.includes("node_modules"),
		}).map((file) => resolve(options.configDir, file)),
	);

	const unique = [...new Set(files)].sort();

	if (!options.filter) return unique;

	const filterLower = options.filter.toLowerCase();
	return unique.filter((file) => file.toLowerCase().includes(filterLower));
}
