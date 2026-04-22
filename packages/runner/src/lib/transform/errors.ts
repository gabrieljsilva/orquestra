export class SwcNotAvailableError extends Error {
	constructor(cause: unknown) {
		const original = cause instanceof Error ? cause.message : String(cause);
		super(
			`Unable to load @swc/core. Check your installation (postinstall may have failed or the platform has no prebuild).\nOriginal error: ${original}`,
			{ cause },
		);
		this.name = "SwcNotAvailableError";
	}
}
