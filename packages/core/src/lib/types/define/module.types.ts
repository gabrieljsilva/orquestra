import type { HookFn } from "../lifecycle/hook.types";
import type { ContainerProvider, ServiceProvider } from "../components";
import type { MacroDefinition } from "./macro.types";

/**
 * A module aggregates injectable components (services, macros, containers)
 * and optional lifecycle hooks. Modules can compose recursively via `modules`.
 *
 * Hooks declared inside a module are registered automatically when the module
 * is included in the configuration (or in another module via `modules`).
 */
export interface ModuleDefinition {
	readonly services?: ReadonlyArray<ServiceProvider>;
	readonly macros?: ReadonlyArray<MacroDefinition<any, any>>;
	readonly containers?: ReadonlyArray<ContainerProvider>;
	readonly modules?: ReadonlyArray<ModuleDefinition>;

	readonly beforeStartServer?: HookFn;
	readonly afterStartServer?: HookFn;
	readonly beforeEachFeature?: HookFn;
	readonly afterEachFeature?: HookFn;
	readonly beforeEachScenario?: HookFn;
	readonly afterEachScenario?: HookFn;
	readonly beforeStopServer?: HookFn;

	readonly __orquestra: "module";
	readonly __token: symbol;
}

export function isModuleDefinition(value: unknown): value is ModuleDefinition {
	return typeof value === "object" && value !== null && (value as { __orquestra?: string }).__orquestra === "module";
}
