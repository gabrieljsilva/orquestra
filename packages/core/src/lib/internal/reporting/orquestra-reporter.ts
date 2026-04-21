import type { OrquestraArtifact } from "../../types/artifact";

export interface ReporterContext {
	outputDir: string;
	artifactPath: string;
}

export abstract class OrquestraReporter {
	abstract run(artifact: OrquestraArtifact, ctx?: ReporterContext): Promise<void> | void;
}
