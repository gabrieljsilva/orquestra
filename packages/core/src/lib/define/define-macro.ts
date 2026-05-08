import type { HookContext } from "../types/lifecycle/hook.types";
import type { MacroDefinition } from "../types/define";

export interface DefineMacroInput<TContext, TInput> {
	title: string;
	execute: (ctx: HookContext, input: TInput) => Promise<TContext> | TContext;
}

/**
 * Declares a macro — a reusable BDD step identified by `title`. Returned
 * definitions can be referenced from feature files via `.given(title)`,
 * `.when(title)`, `.then(title)`, with the context type inferred.
 *
 * When invoked through the DSL, the second argument of `execute` is the
 * accumulated scenario context — the same object that inline steps receive.
 * Macros that don't read context can keep ignoring the argument.
 *
 * Macros are registered eagerly when the worker resolves its modules, so they
 * are available at file-import time.
 */
export function defineMacro<TContext = void, TInput = void>(
	def: DefineMacroInput<TContext, TInput>,
): MacroDefinition<TContext, TInput> {
	return {
		title: def.title,
		execute: def.execute,
		__orquestra: "macro" as const,
		__token: Symbol(`macro:${def.title}`),
	};
}
