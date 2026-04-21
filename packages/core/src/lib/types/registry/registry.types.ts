/**
 * Registry augmentavel por users via declaracao de modulo.
 * Populado por arquivos .d.ts gerados pelo `orquestra types`.
 *
 * Quando nao augmented, cada chave cai num tipo permissivo (string)
 * para manter a API utilizavel sem types gerados.
 */
export interface OrquestraRegistry {}

export type RegistryPersona = OrquestraRegistry extends { personas: infer P } ? P : string;
export type RegistryDomain = OrquestraRegistry extends { domains: infer D } ? D : string;
export type RegistryMacros = OrquestraRegistry extends { macros: infer M } ? M : Record<string, object>;
export type RegistryMacroTitle = keyof RegistryMacros extends never ? string : keyof RegistryMacros | (string & {});
export type RegistryMacroContext<Title> = Title extends keyof RegistryMacros
	? RegistryMacros[Title] extends object
		? RegistryMacros[Title]
		: {}
	: {};
