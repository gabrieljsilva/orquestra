import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OrquestraConfig } from "@orquestra/core";
import { createJiti } from "jiti";

const DEFAULT_CONFIG_FILE = "orquestra.config.ts";

const jiti = createJiti(import.meta.url, {
	interopDefault: true,
});

export interface LoadedConfig {
	config: OrquestraConfig;
	configDir: string;
}

export async function loadConfig(configPath?: string): Promise<LoadedConfig> {
	const filePath = resolve(process.cwd(), configPath ?? DEFAULT_CONFIG_FILE);

	if (!existsSync(filePath)) {
		throw new Error(`Config file not found: ${filePath}`);
	}

	const imported = await jiti.import(filePath);
	const config = (imported as any).default ?? imported;

	validateConfig(config);

	return {
		config: config as OrquestraConfig,
		configDir: dirname(filePath),
	};
}

function validateConfig(config: unknown): asserts config is OrquestraConfig {
	if (!config || typeof config !== "object") {
		throw new Error("Config must export an object. Use defineConfig() for type safety.");
	}

	const cfg = config as Record<string, unknown>;

	if (cfg.global && cfg.worker) {
		if (cfg.httpServer || cfg.plugins || cfg.helpers || cfg.containers || cfg.services || cfg.macros) {
			throw new Error(
				"Cannot mix global/worker config with flat config. Use either global/worker or flat properties, not both.",
			);
		}
	}

	if (cfg.concurrency !== undefined) {
		const n = Number(cfg.concurrency);
		if (!Number.isInteger(n) || n < 1) {
			throw new Error(`concurrency must be a positive integer, got: ${cfg.concurrency}`);
		}
	}

	if (cfg.timeout !== undefined) {
		const n = Number(cfg.timeout);
		if (!Number.isFinite(n) || n <= 0) {
			throw new Error(`timeout must be a positive number, got: ${cfg.timeout}`);
		}
	}

	if (cfg.testMatch !== undefined) {
		if (!Array.isArray(cfg.testMatch) || cfg.testMatch.some((p: unknown) => typeof p !== "string")) {
			throw new Error("testMatch must be an array of glob strings.");
		}
	}
}
