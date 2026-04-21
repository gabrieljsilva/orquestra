import type { StepStatus } from "../events";

export interface ArtifactPersona {
	name: string;
	features: string[];
}

export interface ArtifactDomain {
	name: string;
	context: string;
	features: string[];
}

export interface ArtifactStep {
	keyword: "Given" | "When" | "Then";
	name: string;
	status: StepStatus;
	durationMs?: number;
	error?: { message: string; stack?: string };
}

export interface ArtifactScenario {
	name: string;
	status: StepStatus;
	steps: ArtifactStep[];
}

export interface ArtifactFeature {
	name: string;
	domain: string | null;
	context: string | null;
	as: string;
	I: string;
	so: string;
	status: StepStatus;
	scenarios: ArtifactScenario[];
}

export interface ArtifactSummary {
	totalFeatures: number;
	totalScenarios: number;
	passed: number;
	failed: number;
	pending: number;
}

export interface OrquestraArtifact {
	orquestraVersion: string;
	generatedAt: string;
	status: StepStatus;
	glossary: Record<string, string>;
	personas: ArtifactPersona[];
	domains: ArtifactDomain[];
	features: ArtifactFeature[];
	summary: ArtifactSummary;
}
