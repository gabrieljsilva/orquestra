import type { RegistryDomain, RegistryPersona } from "../registry";

export interface FeatureDefinition {
	context?: string;
	domain?: RegistryDomain;
	as: RegistryPersona;
	I: string;
	so: string;
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
