import type { HookFn } from "../types/lifecycle/hook.types";
import type { ContainerProvider, ServiceProvider } from "../types/components";
import type { MacroDefinition, ModuleDefinition } from "../types/define";

export interface DefineModuleInput {
	services?: ReadonlyArray<ServiceProvider>;
	macros?: ReadonlyArray<MacroDefinition<any, any>>;
	containers?: ReadonlyArray<ContainerProvider>;
	modules?: ReadonlyArray<ModuleDefinition>;

	beforeStartServer?: HookFn;
	afterStartServer?: HookFn;
	beforeEachFeature?: HookFn;
	afterEachFeature?: HookFn;
	beforeEachScenario?: HookFn;
	afterEachScenario?: HookFn;
	beforeStopServer?: HookFn;
}

/**
 * Declares a module — a logical grouping of services, macros, containers and
 * optional lifecycle hooks. Modules can recursively include other modules via
 * the `modules` field.
 *
 * Hooks declared inside a module are registered automatically once the module
 * is resolved by the worker.
 */
export function defineModule(input: DefineModuleInput): ModuleDefinition {
	return {
		...input,
		__orquestra: "module" as const,
		__token: Symbol("module"),
	};
}
