import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { OrquestraArtifact } from "@orquestra/core";

const ARTIFACT_FILE = "artifact.json";

export interface WriteArtifactOptions {
	artifact: OrquestraArtifact;
	outputDir: string;
}

export function writeArtifact(options: WriteArtifactOptions): string {
	const absoluteDir = resolve(options.outputDir);
	const outputPath = join(absoluteDir, ARTIFACT_FILE);
	mkdirSync(absoluteDir, { recursive: true });
	writeFileSync(outputPath, JSON.stringify(options.artifact, null, 2));
	return outputPath;
}

export function artifactPath(outputDir: string): string {
	return join(resolve(outputDir), ARTIFACT_FILE);
}
