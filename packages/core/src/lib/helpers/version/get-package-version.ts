import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export const UNKNOWN_PACKAGE_VERSION = "0.0.0";

let cachedVersion: string | null = null;

export function getPackageVersion(): string {
	if (cachedVersion !== null) return cachedVersion;
	cachedVersion = readOrquestraPackageJson();
	return cachedVersion;
}

function readOrquestraPackageJson(): string {
	const resolvers: Array<() => string | null> = [
		() => (typeof require !== "undefined" ? require.resolve("@orquestra/core/package.json") : null),
		() => createRequire(`${process.cwd()}/`).resolve("@orquestra/core/package.json"),
	];

	for (const resolve of resolvers) {
		try {
			const path = resolve();
			if (!path) continue;
			const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
			if (typeof parsed.version === "string" && parsed.version.length > 0) {
				return parsed.version;
			}
		} catch {
			// tenta o proximo resolver
		}
	}

	console.warn(
		`[Orquestra] Nao foi possivel resolver a versao do @orquestra/core; usando fallback "${UNKNOWN_PACKAGE_VERSION}". Checks de compatibilidade de run podem ser imprecisos.`,
	);
	return UNKNOWN_PACKAGE_VERSION;
}
