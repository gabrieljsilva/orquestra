import type { OrquestraArtifact, OrquestraConfig, OrquestraReporter, ReporterContext } from "@orquestra/core";

export function resolveReporters(config: OrquestraConfig): OrquestraReporter[] {
	if (config.reporters && config.reporters.length > 0) return config.reporters;
	if (config.reporter) return [config.reporter];
	return [];
}

export async function runReporters(
	reporters: OrquestraReporter[],
	artifact: OrquestraArtifact,
	ctx: ReporterContext,
): Promise<void> {
	for (const reporter of reporters) {
		try {
			await reporter.run(artifact, ctx);
		} catch (err) {
			const error = err as Error;
			console.error(`[orquestra] reporter failed: ${error.message}`);
		}
	}
}
