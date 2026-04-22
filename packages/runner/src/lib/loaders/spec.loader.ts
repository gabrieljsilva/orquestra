import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { OrquestraSpec } from "@orquestra/core";
import { createOrquestraJiti } from "../transform";

export interface LoadSpecOptions {
	tsconfigPath?: string;
}

export async function loadSpec(
	specPath: string | undefined,
	configDir: string,
	options: LoadSpecOptions = {},
): Promise<OrquestraSpec | null> {
	if (!specPath) return null;

	const filePath = resolve(configDir, specPath);

	if (!existsSync(filePath)) {
		throw new Error(`Spec file not found: ${filePath}`);
	}

	const jiti = createOrquestraJiti({
		id: import.meta.url,
		cwd: configDir,
		tsconfigPath: options.tsconfigPath,
	});

	const imported = await jiti.import(filePath);
	const spec = (imported as any).default ?? imported;

	validateSpec(spec);

	return spec as OrquestraSpec;
}

function validateSpec(spec: unknown): asserts spec is OrquestraSpec {
	if (!spec || typeof spec !== "object") {
		throw new Error("Spec must export an object. Use defineSpec() for type safety.");
	}

	const s = spec as Record<string, unknown>;

	if (s.glossary !== undefined) {
		if (typeof s.glossary !== "object" || s.glossary === null || Array.isArray(s.glossary)) {
			throw new Error("glossary must be a Record<string, string>.");
		}
		for (const [key, value] of Object.entries(s.glossary as Record<string, unknown>)) {
			if (typeof value !== "string") {
				throw new Error(`glossary["${key}"] must be a string, got: ${typeof value}`);
			}
		}
	}

	if (s.domains !== undefined) {
		if (!Array.isArray(s.domains)) {
			throw new Error("domains must be an array.");
		}
		for (const domain of s.domains) {
			if (!domain.name || typeof domain.name !== "string") {
				throw new Error("Each domain must have a name (string).");
			}
			if (!domain.context || typeof domain.context !== "string") {
				throw new Error(`Domain "${domain.name}" must have a context (string).`);
			}
		}
	}
}
