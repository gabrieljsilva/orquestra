import { createHash } from "node:crypto";
import { createJiti } from "jiti";
import { OrquestraTransformer } from "./swc-transform";
import { type ResolvedTsConfig, TsConfigResolver } from "./tsconfig-resolver";

export type Jiti = ReturnType<typeof createJiti>;
type JitiOptions = NonNullable<Parameters<typeof createJiti>[1]>;

export interface CreateOrquestraJitiOptions {
	id: string;
	cwd: string;
	tsconfigPath?: string;
	/**
	 * Persist transformed output to disk between runs. Default `true` —
	 * unlocks the second-run latency drop the user would expect from a
	 * Vite-style runner. Pass `false` for one-shot CI runs that don't
	 * benefit from cache, or when sources change without filesystem
	 * mtime updates (rare).
	 */
	fsCache?: boolean;
	/**
	 * Emit source maps from the SWC transform. `"inline"` embeds them in
	 * the .js so V8 + `--enable-source-maps` resolve breakpoints back to
	 * the original `.ts`. Off by default — turn on for debug runs only,
	 * the cache files grow ~30%.
	 */
	sourceMaps?: boolean | "inline";
	/** Extra jiti options. `transform` is always overridden by the SWC transformer. */
	jiti?: Omit<JitiOptions, "transform">;
}

export function createOrquestraJiti(options: CreateOrquestraJitiOptions): Jiti {
	const tsconfig = TsConfigResolver.resolve({
		tsconfigPath: options.tsconfigPath,
		cwd: options.cwd,
	});
	const transformer = new OrquestraTransformer(tsconfig, { sourceMaps: options.sourceMaps });

	// Append a hash of the transpile-affecting config to the jiti id so the
	// fs cache picks a distinct directory whenever target/paths/decorators/
	// sourceMaps change. Without this, edits to `tsconfig.json` would silently
	// serve stale JS until the user manually wiped the cache.
	const id = `${options.id}#${buildCacheBucket(tsconfig, options.sourceMaps)}`;

	return createJiti(id, {
		interopDefault: true,
		fsCache: options.fsCache ?? true,
		...options.jiti,
		transform: transformer.transform.bind(transformer),
	});
}

export function buildCacheBucket(tsconfig: ResolvedTsConfig, sourceMaps: boolean | "inline" | undefined): string {
	const signature = JSON.stringify({
		target: tsconfig.target,
		baseUrl: tsconfig.baseUrl,
		paths: tsconfig.paths,
		experimentalDecorators: tsconfig.experimentalDecorators,
		emitDecoratorMetadata: tsconfig.emitDecoratorMetadata,
		sourceMaps: sourceMaps ?? false,
	});
	return createHash("sha1").update(signature).digest("hex").slice(0, 12);
}
