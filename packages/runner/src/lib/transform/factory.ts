import { createJiti } from "jiti";
import { OrquestraTransformer } from "./swc-transform";
import { TsConfigResolver } from "./tsconfig-resolver";

export type Jiti = ReturnType<typeof createJiti>;
type JitiOptions = NonNullable<Parameters<typeof createJiti>[1]>;

export interface CreateOrquestraJitiOptions {
	id: string;
	cwd: string;
	tsconfigPath?: string;
	/** Extra jiti options. `transform` is always overridden by the SWC transformer. */
	jiti?: Omit<JitiOptions, "transform">;
}

export function createOrquestraJiti(options: CreateOrquestraJitiOptions): Jiti {
	const tsconfig = TsConfigResolver.resolve({
		tsconfigPath: options.tsconfigPath,
		cwd: options.cwd,
	});
	const transformer = new OrquestraTransformer(tsconfig);

	return createJiti(options.id, {
		interopDefault: true,
		fsCache: false,
		...options.jiti,
		transform: transformer.transform.bind(transformer),
	});
}
