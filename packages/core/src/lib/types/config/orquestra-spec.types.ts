export interface OrquestraDomain {
	name: string;
	context: string;
}

export interface OrquestraSpec {
	glossary?: Record<string, string>;
	domains?: Array<OrquestraDomain>;
}
