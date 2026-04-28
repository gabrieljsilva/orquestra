import type { HookContext } from "../lifecycle/hook.types";

/**
 * A macro defined via `defineMacro`. Carries the title used for step lookup,
 * an `execute` callback, an internal token (Symbol identity for the IoC), and
 * a discriminator for runtime detection.
 */
export interface MacroDefinition<TContext = unknown, TInput = unknown> {
	readonly title: string;
	readonly execute: (ctx: HookContext, input: TInput) => Promise<TContext> | TContext;
	readonly __orquestra: "macro";
	readonly __token: symbol;
}

export function isMacroDefinition(value: unknown): value is MacroDefinition {
	return typeof value === "object" && value !== null && (value as { __orquestra?: string }).__orquestra === "macro";
}

export type ExtractMacroContext<M> = M extends MacroDefinition<infer C, any> ? C : never;

export type ExtractMacroInput<M> = M extends MacroDefinition<any, infer I> ? I : never;
