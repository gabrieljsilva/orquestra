import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OrquestraConfig } from "@orquestra/core";
import { type Jiti, createOrquestraJiti } from "../transform";

const DEFAULT_CONFIG_FILE = "orquestra.config.ts";

export interface LoadedConfig {
	config: OrquestraConfig;
	configDir: string;
	configPath: string;
	/** The jiti instance that was used to load the config — reuse it for
	 * loadSpec, etc. instead of paying the SWC + tsconfig setup again. */
	jiti: Jiti;
}

export interface LoadConfigOptions {
	tsconfigPath?: string;
	/** Reuse an existing jiti instance instead of creating one. Saves the
	 * SWC + tsconfig setup cost when the caller already has one. */
	jiti?: Jiti;
}

export async function loadConfig(configPath?: string, options: LoadConfigOptions = {}): Promise<LoadedConfig> {
	const filePath = resolve(process.cwd(), configPath ?? DEFAULT_CONFIG_FILE);

	if (!existsSync(filePath)) {
		throw new Error(`Config file not found: ${filePath}`);
	}

	const configDir = dirname(filePath);
	const jiti =
		options.jiti ??
		createOrquestraJiti({
			id: import.meta.url,
			cwd: configDir,
			tsconfigPath: options.tsconfigPath,
		});

	const imported = await jiti.import(filePath);
	const config = (imported as any).default ?? imported;

	validateConfig(config);

	return {
		config: config as OrquestraConfig,
		configDir,
		configPath: filePath,
		jiti,
	};
}

export function validateConfig(config: unknown): asserts config is OrquestraConfig {
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

	for (const key of ["scenarioTimeoutMs", "eachHookTimeoutMs", "serverHookTimeoutMs"] as const) {
		if (cfg[key] !== undefined) {
			const n = Number(cfg[key]);
			if (!Number.isFinite(n) || n <= 0) {
				throw new Error(`${key} must be a positive number, got: ${cfg[key]}`);
			}
		}
	}

	if (cfg.workerMemoryLimitMb !== undefined) {
		const n = Number(cfg.workerMemoryLimitMb);
		if (!Number.isFinite(n) || n <= 0) {
			throw new Error(`workerMemoryLimitMb must be a positive number, got: ${cfg.workerMemoryLimitMb}`);
		}
	}

	if (cfg.detectOpenHandles !== undefined && typeof cfg.detectOpenHandles !== "boolean") {
		throw new Error(`detectOpenHandles must be a boolean, got: ${cfg.detectOpenHandles}`);
	}

	if (cfg.global !== undefined && typeof cfg.global === "object" && cfg.global !== null) {
		const g = cfg.global as Record<string, unknown>;
		for (const key of ["beforeProvision", "afterProvision", "beforeDeprovision", "afterDeprovision"] as const) {
			const value = g[key];
			if (value === undefined) continue;
			const ok = typeof value === "function" || (Array.isArray(value) && value.every((v) => typeof v === "function"));
			if (!ok) {
				throw new Error(`global.${key} must be a function or an array of functions`);
			}
		}
	}

	if (cfg.testMatch !== undefined) {
		if (!Array.isArray(cfg.testMatch) || cfg.testMatch.some((p: unknown) => typeof p !== "string")) {
			throw new Error("testMatch must be an array of glob strings.");
		}
	}
}
