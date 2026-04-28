import type { OrquestraArtifact } from "@orquestra/core";
import { appendOrphanFiles, recomputeOverallStatus } from "./orphan-files";

function emptyArtifact(): OrquestraArtifact {
	return {
		orquestraVersion: "0.0.0-test",
		generatedAt: new Date(0).toISOString(),
		status: "pending",
		glossary: {},
		personas: [],
		domains: [],
		features: [],
		summary: {
			totalFeatures: 0,
			totalScenarios: 0,
			passed: 0,
			failed: 0,
			pending: 0,
		},
	};
}

describe("appendOrphanFiles (#6)", () => {
	it("adds a crashed pseudo-feature for each failed file without meta", () => {
		const artifact = emptyArtifact();
		appendOrphanFiles(artifact, ["a.feature.ts", "b.feature.ts"], []);

		expect(artifact.features).toHaveLength(2);
		expect(artifact.features[0]).toMatchObject({
			file: "a.feature.ts",
			status: "failed",
			crashed: true,
			scenarios: [],
		});
		expect(artifact.summary.totalFeatures).toBe(2);
		expect(artifact.summary.failed).toBe(2);
		expect(artifact.summary.totalScenarios).toBe(2);
	});

	it("adds pending pseudo-features for files that were never assigned", () => {
		const artifact = emptyArtifact();
		appendOrphanFiles(artifact, [], ["c.feature.ts"]);

		expect(artifact.features).toHaveLength(1);
		expect(artifact.features[0]).toMatchObject({
			file: "c.feature.ts",
			status: "pending",
			scenarios: [],
		});
		expect(artifact.features[0].crashed).toBeUndefined();
		expect(artifact.summary.pending).toBe(1);
	});

	it("does not duplicate features whose file already appears in the artifact", () => {
		const artifact = emptyArtifact();
		artifact.features.push({
			name: "real feature",
			file: "a.feature.ts",
			domain: null,
			context: null,
			as: "",
			I: "",
			so: "",
			status: "success",
			scenarios: [{ name: "ok", status: "success", steps: [] }],
		});
		artifact.summary.totalFeatures = 1;
		artifact.summary.totalScenarios = 1;
		artifact.summary.passed = 1;

		appendOrphanFiles(artifact, ["a.feature.ts"], ["a.feature.ts"]);

		expect(artifact.features).toHaveLength(1);
		expect(artifact.summary.failed).toBe(0);
		expect(artifact.summary.pending).toBe(0);
	});

	it("dedups within the failed/pending lists themselves (file referenced twice)", () => {
		const artifact = emptyArtifact();
		appendOrphanFiles(artifact, ["dup.feature.ts", "dup.feature.ts"], ["dup.feature.ts"]);

		expect(artifact.features).toHaveLength(1);
		expect(artifact.features[0].status).toBe("failed");
		expect(artifact.features[0].crashed).toBe(true);
		expect(artifact.summary.failed).toBe(1);
		expect(artifact.summary.pending).toBe(0);
	});
});

describe("recomputeOverallStatus", () => {
	it("marks the artifact failed if any failures exist", () => {
		const artifact = emptyArtifact();
		artifact.summary.passed = 5;
		artifact.summary.failed = 1;
		recomputeOverallStatus(artifact);
		expect(artifact.status).toBe("failed");
	});

	it("marks success only when there are passes and no pending/failed", () => {
		const artifact = emptyArtifact();
		artifact.summary.passed = 3;
		recomputeOverallStatus(artifact);
		expect(artifact.status).toBe("success");
	});

	it("falls back to pending when there is pending work", () => {
		const artifact = emptyArtifact();
		artifact.summary.passed = 2;
		artifact.summary.pending = 1;
		recomputeOverallStatus(artifact);
		expect(artifact.status).toBe("pending");
	});

	it("zero counts → pending", () => {
		const artifact = emptyArtifact();
		recomputeOverallStatus(artifact);
		expect(artifact.status).toBe("pending");
	});
});
