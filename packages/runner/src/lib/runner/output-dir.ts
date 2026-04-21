import { isAbsolute, resolve } from "node:path";
import type { OrquestraConfig } from "@orquestra/core";

const DEFAULT_OUTPUT_DIR = ".orquestra";

export function resolveOutputDir(config: OrquestraConfig, configDir: string): string {
	const configured = config.outputDir;
	if (!configured) return resolve(configDir, DEFAULT_OUTPUT_DIR);
	if (isAbsolute(configured)) return configured;
	return resolve(configDir, configured);
}
