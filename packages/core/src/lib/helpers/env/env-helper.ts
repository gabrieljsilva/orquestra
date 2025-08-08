import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { OrquestraHelper } from "../../internal/orquestra-helper";
import { IOrquestraContext } from "../../types";

export interface LoadEnvOptions {
	fromPath?: string;
	fromValues?: Record<string, string>;
}

export class EnvHelper extends OrquestraHelper {
	private envVariables: Record<string, string> = {};
	public readonly originalEnvVariables: Readonly<Record<string, string | undefined>>;

	constructor(ctx: IOrquestraContext, options?: LoadEnvOptions) {
		super(ctx);

		if (options?.fromPath || options?.fromValues) {
			if (options.fromPath) {
				this.loadFromPath(options.fromPath);
			}

			if (options.fromValues) {
				this.loadFromValues(options.fromValues);
			}
		} else {
			this.loadFromDefaultEnvFile();
		}

		this.originalEnvVariables = Object.freeze({ ...process.env });
	}

	private loadFromValues(values: Record<string, string>): void {
		for (const [key, value] of Object.entries(values)) {
			this.envVariables[key] = value;
			process.env[key] = value;
		}
	}

	private loadFromPath(path: string): void {
		const resolvedPath = resolve(process.cwd(), path);

		if (!existsSync(resolvedPath)) {
			console.warn(`[Orquestra]: Environment file not found: ${resolvedPath}`);
			return;
		}

		const result = config({ path: resolvedPath, quiet: true });

		if (result.error) {
			console.error(`[Orquestra]: Error loading environment file: ${result.error.message}`);
			return;
		}

		if (result.parsed) {
			this.envVariables = { ...this.envVariables, ...result.parsed };
		}
	}

	private loadFromDefaultEnvFile(): void {
		const result = config({
			quiet: true,
		});

		if (result.error) {
			console.warn("[Orquestra]: No .env file found or error loading it");
			return;
		}

		if (result.parsed) {
			this.envVariables = { ...this.envVariables, ...result.parsed };
		}
	}

	public override(key: string, value: string): void {
		this.envVariables[key] = value;
		process.env[key] = value;
	}

	public clear(key: string) {
		this.override(key, "");
	}

	public get(key: string): string | undefined {
		return this.envVariables[key] || process.env[key];
	}

	public getAll(): Record<string, string> {
		return { ...this.envVariables };
	}

	public restore(key: string) {
		this.override(key, this.originalEnvVariables[key]);
	}

	public restoreAll() {
		for (const [key, value] of Object.entries(this.originalEnvVariables)) {
			this.override(key, value);
		}
	}
}
