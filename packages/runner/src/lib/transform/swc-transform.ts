import { createRequire } from "node:module";
import ts from "typescript";
import { SwcNotAvailableError } from "./errors";
import type { ResolvedTsConfig } from "./tsconfig-resolver";

const require = createRequire(import.meta.url);

type JscTarget =
	| "es3"
	| "es5"
	| "es2015"
	| "es2016"
	| "es2017"
	| "es2018"
	| "es2019"
	| "es2020"
	| "es2021"
	| "es2022"
	| "es2023"
	| "es2024"
	| "esnext";

/**
 * Minimal shape of jiti's TransformOptions we consume. Intentionally not imported from
 * jiti because the public types are only exported via ESM conditional exports and the
 * runner currently compiles under "moduleResolution: node", which cannot read them.
 */
interface JitiTransformOptions {
	source: string;
	filename?: string;
}

interface JitiTransformResult {
	code: string;
	error?: unknown;
}

type SwcModule = {
	transformSync: (src: string, options?: unknown) => { code: string };
};

const TSX_RE = /\.tsx$/;

let swcSingleton: SwcModule | null = null;

function loadSwc(): SwcModule {
	if (swcSingleton) return swcSingleton;
	try {
		swcSingleton = require("@swc/core") as SwcModule;
		return swcSingleton;
	} catch (err) {
		throw new SwcNotAvailableError(err);
	}
}

export class OrquestraTransformer {
	private readonly tsconfig: ResolvedTsConfig;

	constructor(tsconfig: ResolvedTsConfig) {
		this.tsconfig = tsconfig;
	}

	// SWC errors propagate so jiti surfaces them with file context instead of
	// silently returning an empty module.
	transform = (opts: JitiTransformOptions): JitiTransformResult => {
		const swc = loadSwc();
		const filename = opts.filename ?? "";

		const result = swc.transformSync(opts.source, {
			filename,
			sourceMaps: false,
			jsc: {
				parser: {
					syntax: "typescript",
					tsx: TSX_RE.test(filename),
					decorators: true,
				},
				target: OrquestraTransformer.mapScriptTarget(this.tsconfig.target),
				transform: {
					legacyDecorator: this.tsconfig.experimentalDecorators,
					decoratorMetadata: this.tsconfig.experimentalDecorators && this.tsconfig.emitDecoratorMetadata,
				},
				...(this.tsconfig.baseUrl ? { baseUrl: this.tsconfig.baseUrl } : {}),
				...(this.tsconfig.paths ? { paths: this.tsconfig.paths } : {}),
			},
			module: {
				type: "commonjs",
			},
		});

		return { code: result.code };
	};

	private static mapScriptTarget(target: ts.ScriptTarget): JscTarget {
		switch (target) {
			case ts.ScriptTarget.ES3:
				return "es3";
			case ts.ScriptTarget.ES5:
				return "es5";
			case ts.ScriptTarget.ES2015:
				return "es2015";
			case ts.ScriptTarget.ES2016:
				return "es2016";
			case ts.ScriptTarget.ES2017:
				return "es2017";
			case ts.ScriptTarget.ES2018:
				return "es2018";
			case ts.ScriptTarget.ES2019:
				return "es2019";
			case ts.ScriptTarget.ES2020:
				return "es2020";
			case ts.ScriptTarget.ES2021:
				return "es2021";
			case ts.ScriptTarget.ES2022:
				return "es2022";
			case ts.ScriptTarget.ES2023:
				return "es2023";
			case ts.ScriptTarget.ES2024:
				return "es2024";
			case ts.ScriptTarget.ESNext:
				return "esnext";
			default:
				return "es2022";
		}
	}
}
