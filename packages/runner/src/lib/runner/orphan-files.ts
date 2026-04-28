import type { OrquestraArtifact } from "@orquestra/core";

/**
 * Worker crashes (or shutdown before processing) leave their feature files
 * without any `feature:meta` event — those files would otherwise vanish from
 * the artifact. Generate placeholder features for them so CI consumers see
 * what didn't run.
 */
export function appendOrphanFiles(
	artifact: OrquestraArtifact,
	failedFiles: ReadonlyArray<string>,
	pendingFiles: ReadonlyArray<string>,
): void {
	const knownFiles = new Set<string>();
	for (const feature of artifact.features) {
		if (feature.file) knownFiles.add(feature.file);
	}

	for (const file of failedFiles) {
		if (knownFiles.has(file)) continue;
		knownFiles.add(file);
		artifact.features.push({
			name: file,
			file,
			domain: null,
			context: null,
			as: "",
			I: "",
			so: "",
			status: "failed",
			scenarios: [],
			crashed: true,
		});
		artifact.summary.totalFeatures += 1;
		artifact.summary.failed += 1;
		artifact.summary.totalScenarios += 1;
	}

	for (const file of pendingFiles) {
		if (knownFiles.has(file)) continue;
		knownFiles.add(file);
		artifact.features.push({
			name: file,
			file,
			domain: null,
			context: null,
			as: "",
			I: "",
			so: "",
			status: "pending",
			scenarios: [],
		});
		artifact.summary.totalFeatures += 1;
		artifact.summary.pending += 1;
		artifact.summary.totalScenarios += 1;
	}
}

/**
 * Recomputes the overall artifact status after orphan features have been
 * appended (their counts wouldn't have been visible to `generateArtifact`).
 */
export function recomputeOverallStatus(artifact: OrquestraArtifact): void {
	if (artifact.summary.failed > 0) {
		artifact.status = "failed";
	} else if (artifact.summary.passed > 0 && artifact.summary.pending === 0) {
		artifact.status = "success";
	} else {
		artifact.status = "pending";
	}
}
