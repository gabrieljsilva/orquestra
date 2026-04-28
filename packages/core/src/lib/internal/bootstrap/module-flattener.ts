import type { ModuleDefinition } from "../../types/define";
import type { ContainerProvider, ServiceProvider } from "../../types/components";
import type { MacroDefinition } from "../../types/define";
import type { HookFn, HookKind } from "../../types/lifecycle/hook.types";

export interface FlattenedModules {
	services: ServiceProvider[];
	macros: MacroDefinition<any, any>[];
	containers: ContainerProvider[];
	hooks: Map<HookKind, HookFn[]>;
}

const HOOK_KINDS = [
	"beforeStartServer",
	"afterStartServer",
	"beforeEachFeature",
	"afterEachFeature",
	"beforeEachScenario",
	"afterEachScenario",
	"beforeStopServer",
] as const satisfies ReadonlyArray<HookKind>;

const MODULE_HOOK_FIELDS: Record<HookKind, keyof ModuleDefinition> = {
	beforeStartServer: "beforeStartServer",
	afterStartServer: "afterStartServer",
	beforeEachFeature: "beforeEachFeature",
	afterEachFeature: "afterEachFeature",
	beforeEachScenario: "beforeEachScenario",
	afterEachScenario: "afterEachScenario",
	beforeStopServer: "beforeStopServer",
};

/**
 * DFS-walks a list of modules and produces a flat collection of providers and
 * hooks. Each module is visited at most once (Symbol identity).
 */
export function flattenModules(roots: ReadonlyArray<ModuleDefinition>): FlattenedModules {
	const seen = new Set<symbol>();
	const services: ServiceProvider[] = [];
	const macros: MacroDefinition<any, any>[] = [];
	const containers: ContainerProvider[] = [];
	const hooks = new Map<HookKind, HookFn[]>();
	for (const kind of HOOK_KINDS) hooks.set(kind, []);

	const visit = (mod: ModuleDefinition) => {
		if (seen.has(mod.__token)) return;
		seen.add(mod.__token);

		if (mod.modules) {
			for (const child of mod.modules) visit(child);
		}

		if (mod.services) services.push(...mod.services);
		if (mod.macros) macros.push(...mod.macros);
		if (mod.containers) containers.push(...mod.containers);

		for (const kind of HOOK_KINDS) {
			const field = MODULE_HOOK_FIELDS[kind];
			const fn = mod[field];
			if (typeof fn === "function") {
				hooks.get(kind)!.push(fn as HookFn);
			}
		}
	};

	for (const mod of roots) visit(mod);

	return { services, macros, containers, hooks };
}
