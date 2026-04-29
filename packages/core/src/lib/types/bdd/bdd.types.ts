import type { RegistryDomain, RegistryPersona } from "../registry";

export interface FeatureDefinition {
	context?: string;
	domain?: RegistryDomain;
	/**
	 * Persona narrative (`As a <persona>`). Required for E2E features that
	 * feed personas/domains into the artifact. Optional in code-first BDD
	 * for unit/integration via `@orquestra/vitest`, where the persona axis
	 * usually doesn't apply ("technical" features).
	 */
	as?: RegistryPersona;
	/** First-person goal narrative (`I want to ...`). Optional — see `as`. */
	I?: string;
	/** Outcome narrative (`So that ...`). Optional — see `as`. */
	so?: string;
	/**
	 * Time budget (ms) applied to every scenario body in this feature, unless
	 * the scenario overrides it. Falls back to the global `scenarioTimeoutMs`
	 * from the runner config when omitted.
	 */
	timeoutMs?: number;
}

export interface ScenarioOptions {
	/** Overrides the feature- or config-level scenario time budget for this scenario alone. */
	timeoutMs?: number;
}
