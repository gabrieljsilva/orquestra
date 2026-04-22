import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import ts from "typescript";

export interface ResolvedTsConfig {
	experimentalDecorators: boolean;
	emitDecoratorMetadata: boolean;
	target: ts.ScriptTarget;
	baseUrl?: string;
	paths?: Record<string, string[]>;
	tsconfigPath?: string;
}

export interface ResolveTsConfigOptions {
	tsconfigPath?: string;
	cwd: string;
}

const DEFAULT_CONFIG: ResolvedTsConfig = {
	experimentalDecorators: false,
	emitDecoratorMetadata: false,
	target: ts.ScriptTarget.ES2022,
};

export class TsConfigResolver {
	private static readonly byTsconfigPath = new Map<string, ResolvedTsConfig>();
	private static readonly cwdMisses = new Set<string>();

	static resolve(options: ResolveTsConfigOptions): ResolvedTsConfig {
		const tsconfigPath = TsConfigResolver.findTsConfig(options);

		if (!tsconfigPath) {
			if (!options.tsconfigPath) TsConfigResolver.cwdMisses.add(options.cwd);
			return DEFAULT_CONFIG;
		}

		const cached = TsConfigResolver.byTsconfigPath.get(tsconfigPath);
		if (cached) return cached;

		const resolved = TsConfigResolver.parseTsConfig(tsconfigPath);
		TsConfigResolver.byTsconfigPath.set(tsconfigPath, resolved);
		return resolved;
	}

	static clearCache(): void {
		TsConfigResolver.byTsconfigPath.clear();
		TsConfigResolver.cwdMisses.clear();
	}

	private static findTsConfig(options: ResolveTsConfigOptions): string | undefined {
		if (options.tsconfigPath) {
			const abs = isAbsolute(options.tsconfigPath) ? options.tsconfigPath : resolve(options.cwd, options.tsconfigPath);
			if (!existsSync(abs)) {
				throw new Error(`tsconfig not found at: ${abs}`);
			}
			return abs;
		}
		if (TsConfigResolver.cwdMisses.has(options.cwd)) return undefined;
		return ts.findConfigFile(options.cwd, ts.sys.fileExists, "tsconfig.json");
	}

	private static parseTsConfig(tsconfigPath: string): ResolvedTsConfig {
		const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
		if (error || !config) {
			const message = error?.messageText
				? typeof error.messageText === "string"
					? error.messageText
					: error.messageText.messageText
				: "unknown error";
			throw new Error(`Failed to read tsconfig at ${tsconfigPath}: ${message}`);
		}

		const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(tsconfigPath));
		const opts = parsed.options;

		return {
			experimentalDecorators: opts.experimentalDecorators === true,
			emitDecoratorMetadata: opts.emitDecoratorMetadata === true,
			target: opts.target ?? ts.ScriptTarget.ES2022,
			baseUrl: opts.baseUrl,
			paths: TsConfigResolver.normalizePaths(opts.paths),
			tsconfigPath,
		};
	}

	private static normalizePaths(paths: ts.MapLike<string[]> | undefined): Record<string, string[]> | undefined {
		if (!paths) return undefined;
		const result: Record<string, string[]> = {};
		for (const key of Object.keys(paths)) {
			const value = paths[key];
			if (Array.isArray(value)) result[key] = value;
		}
		return result;
	}
}
