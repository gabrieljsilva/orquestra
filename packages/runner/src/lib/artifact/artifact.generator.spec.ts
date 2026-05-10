import type { ArtifactOpenHandle, FeatureMeta, StepEvent } from "@orquestra/core";
import { generateArtifact } from "./artifact.generator";

function meta(feature: string, file: string): FeatureMeta {
	return {
		feature,
		as: "user",
		I: "do X",
		so: "Y",
		file,
	} as unknown as FeatureMeta;
}

function passingStep(feature: string, scenario: string): StepEvent {
	return {
		feature,
		scenario,
		stepId: `${feature}-${scenario}-step`,
		stepName: "a step",
		keyword: "Given",
		status: "success",
		durationMs: 1,
	} as StepEvent;
}

function fakeHandle(type: string): ArtifactOpenHandle {
	return { type, stack: [] };
}

describe("generateArtifact — open handles", () => {
	it("attaches openHandles to the matching feature when openHandlesByFile has an entry", () => {
		const fileA = "/abs/a.feature.ts";
		const artifact = generateArtifact({
			version: "test",
			events: [passingStep("feature A", "s1")],
			meta: [meta("feature A", fileA)],
			spec: null,
			featureFilesByName: { "feature A": fileA },
			openHandlesByFile: { [fileA]: [fakeHandle("Timeout"), fakeHandle("TCPSOCKETWRAP")] },
			detectOpenHandlesEnabled: true,
		});

		expect(artifact.features[0].openHandles).toHaveLength(2);
		expect(artifact.features[0].openHandles?.map((h) => h.type)).toEqual(["Timeout", "TCPSOCKETWRAP"]);
	});

	it("does not add the openHandles field on features with no leak (keeps artifact lean)", () => {
		const file = "/abs/a.feature.ts";
		const artifact = generateArtifact({
			version: "test",
			events: [passingStep("feature A", "s1")],
			meta: [meta("feature A", file)],
			spec: null,
			featureFilesByName: { "feature A": file },
			openHandlesByFile: {},
			detectOpenHandlesEnabled: true,
		});

		expect(artifact.features[0].openHandles).toBeUndefined();
	});

	it("emits summary aggregates only when detection was enabled — opt-in, never confused with 'verified zero'", () => {
		const file = "/abs/a.feature.ts";
		// Detection ON, no leaks → fields present and zeroed (signals "checked").
		const cleanRun = generateArtifact({
			version: "test",
			events: [passingStep("feature A", "s1")],
			meta: [meta("feature A", file)],
			spec: null,
			featureFilesByName: { "feature A": file },
			openHandlesByFile: {},
			detectOpenHandlesEnabled: true,
		});
		expect(cleanRun.summary.featuresWithOpenHandles).toBe(0);
		expect(cleanRun.summary.totalOpenHandles).toBe(0);

		// Detection OFF, no info → fields absent (consumer must not read 0).
		const oblivious = generateArtifact({
			version: "test",
			events: [passingStep("feature A", "s1")],
			meta: [meta("feature A", file)],
			spec: null,
			featureFilesByName: { "feature A": file },
			detectOpenHandlesEnabled: false,
		});
		expect(oblivious.summary.featuresWithOpenHandles).toBeUndefined();
		expect(oblivious.summary.totalOpenHandles).toBeUndefined();
	});

	it("aggregates featuresWithOpenHandles + totalOpenHandles across multiple features", () => {
		const fileA = "/abs/a.feature.ts";
		const fileB = "/abs/b.feature.ts";
		const fileC = "/abs/c.feature.ts";
		const artifact = generateArtifact({
			version: "test",
			events: [passingStep("feature A", "s"), passingStep("feature B", "s"), passingStep("feature C", "s")],
			meta: [meta("feature A", fileA), meta("feature B", fileB), meta("feature C", fileC)],
			spec: null,
			featureFilesByName: { "feature A": fileA, "feature B": fileB, "feature C": fileC },
			openHandlesByFile: {
				[fileA]: [fakeHandle("Timeout")],
				[fileC]: [fakeHandle("TCPSOCKETWRAP"), fakeHandle("FSReqCallback")],
			},
			detectOpenHandlesEnabled: true,
		});

		expect(artifact.summary.featuresWithOpenHandles).toBe(2);
		expect(artifact.summary.totalOpenHandles).toBe(3);
	});
});
