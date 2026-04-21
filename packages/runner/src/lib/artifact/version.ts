import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const UNKNOWN_VERSION = "0.0.0";

let cached: string | null = null;

export function getRunnerVersion(): string {
	if (cached !== null) return cached;
	cached = readRunnerPackageJson();
	return cached;
}

function readRunnerPackageJson(): string {
	const resolvers: Array<() => string | null> = [
		() => (typeof require !== "undefined" ? require.resolve("@orquestra/runner/package.json") : null),
		() => createRequire(`${process.cwd()}/`).resolve("@orquestra/runner/package.json"),
	];

	for (const resolver of resolvers) {
		try {
			const path = resolver();
			if (!path) continue;
			const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
			if (typeof parsed.version === "string" && parsed.version.length > 0) {
				return parsed.version;
			}
		} catch {
			// try next
		}
	}

	return UNKNOWN_VERSION;
}
