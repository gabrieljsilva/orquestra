import type { RegistryDomain, RegistryPersona } from "../registry";

export interface FeatureDefinition {
	context?: string;
	domain?: RegistryDomain;
	as: RegistryPersona;
	I: string;
	so: string;
}
