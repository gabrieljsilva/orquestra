import { AsyncLocalStorage } from "node:async_hooks";
import type { FeatureDefinition } from "../../types/bdd";
import type { StepEvent } from "../../types/events";
import type { RegistryMacroContext, RegistryMacroTitle } from "../../types/registry";
import type { FeatureMeta } from "../../types/reporting";
import { MacroRegistry, OrquestraMacro } from "../orquestra-macro";
import { BddRunner } from "./bdd.runner";

export enum StepKind {
	GIVEN = "GIVEN",
	WHEN = "WHEN",
	THEN = "THEN",
}

export type Awaitable<T> = T | Promise<T>;

type StepFn<C extends object, T extends object> = (ctx: Readonly<C>) => Awaitable<T> | Awaitable<void>;

export class Step<C extends object, T extends object> {
	kind: StepKind;
	name: string;
	fn: StepFn<C, T> | undefined;

	constructor(kind: StepKind, name: string, fn?: StepFn<C, T>) {
		this.kind = kind;
		this.name = name;
		this.fn = fn;
	}

	async run(ctx: C): Promise<T> {
		if (!this.fn) throw new Error(`Step "${this.name}" has no implementation`);
		return this.fn(Object.freeze({ ...ctx }) as Readonly<C>) as Promise<T>;
	}
}

export class Scenario<C extends object = {}> {
	name: string;
	private steps: Array<Step<any, any>> = [];
	private readonly feature: Feature;

	constructor(name: string, feature: Feature) {
		this.name = name;
		this.feature = feature;
	}

	given<T extends object = {}>(name: string, fn: StepFn<C, T>): Scenario<C & T>;
	given<Title extends RegistryMacroTitle>(title: Title): Scenario<C & RegistryMacroContext<Title>>;
	given<T extends object = {}>(name: string): Scenario<C & T>;
	given<T extends object>(name: string, fn?: StepFn<C, T>): Scenario<any> {
		return this.feature.withRegistry(() => {
			if (fn) {
				const step = new Step<C, T>(StepKind.GIVEN, name, fn);
				this.steps.push(step);
				this.feature.registerStep(step);
				return this as unknown as Scenario<C & T>;
			}
			const existing = this.feature.getStep<C, T>(StepKind.GIVEN, name);
			if (existing) {
				this.steps.push(existing);
				return this as unknown as Scenario<C & T>;
			}
			const macro = this.feature.getMacroStep<C, T>(StepKind.GIVEN, name);
			if (macro) {
				this.steps.push(macro);
				return this as unknown as Scenario<C & T>;
			}
			const pending = new Step<C, T>(StepKind.GIVEN, name);
			this.steps.push(pending);
			return this as unknown as Scenario<C & T>;
		});
	}

	when<T extends object = {}>(name: string, fn: StepFn<C, T>): Scenario<C & T>;
	when<Title extends RegistryMacroTitle>(title: Title): Scenario<C & RegistryMacroContext<Title>>;
	when<T extends object = {}>(name: string): Scenario<C & T>;
	when<T extends object>(name: string, fn?: StepFn<C, T>): Scenario<any> {
		return this.feature.withRegistry(() => {
			if (fn) {
				const step = new Step<C, T>(StepKind.WHEN, name, fn);
				this.steps.push(step);
				this.feature.registerStep(step);
				return this as unknown as Scenario<C & T>;
			}
			const existing = this.feature.getStep<C, T>(StepKind.WHEN, name);
			if (existing) {
				this.steps.push(existing);
				return this as unknown as Scenario<C & T>;
			}
			const macro = this.feature.getMacroStep<C, T>(StepKind.WHEN, name);
			if (macro) {
				this.steps.push(macro);
				return this as unknown as Scenario<C & T>;
			}
			const pending = new Step<C, T>(StepKind.WHEN, name);
			this.steps.push(pending);
			return this as unknown as Scenario<C & T>;
		});
	}

	// biome-ignore lint/suspicious/noThenProperty: Gherkin semantics
	then<T extends object = {}>(name: string, fn: StepFn<C, T>): Scenario<C & T>;
	// biome-ignore lint/suspicious/noThenProperty: Gherkin semantics
	then<Title extends RegistryMacroTitle>(title: Title): Scenario<C & RegistryMacroContext<Title>>;
	then<T extends object = {}>(name: string): Scenario<C & T>;
	// biome-ignore lint/suspicious/noThenProperty: Gherkin semantics
	then<T extends object>(name: string, fn?: StepFn<C, T>): Scenario<any> {
		return this.feature.withRegistry(() => {
			if (fn) {
				const step = new Step<C, T>(StepKind.THEN, name, fn);
				this.steps.push(step);
				this.feature.registerStep(step);
				return this as unknown as Scenario<C & T>;
			}
			const existing = this.feature.getStep<C, T>(StepKind.THEN, name);
			if (existing) {
				this.steps.push(existing);
				return this as unknown as Scenario<C & T>;
			}
			const macro = this.feature.getMacroStep<C, T>(StepKind.THEN, name);
			if (macro) {
				this.steps.push(macro);
				return this as unknown as Scenario<C & T>;
			}
			const pending = new Step<C, T>(StepKind.THEN, name);
			this.steps.push(pending);
			return this as unknown as Scenario<C & T>;
		});
	}

	async runAllSteps(initialCtx: Partial<C> = {} as Partial<C>): Promise<C> {
		return (await BddRunner.runScenario(this as any, initialCtx as any)) as C;
	}
}

export class Feature {
	private readonly container: BddContainer;
	private readonly name: string;
	private readonly context?: string;
	private readonly domain?: string;
	private readonly as: string;
	private readonly I: string;
	private readonly so: string;
	private readonly scenarios: Array<Scenario<any>> = [];
	private readonly registry: Map<string, Step<any, any>> = new Map();
	private readonly als = new AsyncLocalStorage<Map<string, Step<any, any>>>();
	private readonly events: StepEvent[] = [];

	constructor(container: BddContainer, name: string, definition: FeatureDefinition) {
		this.container = container;
		this.name = name;
		this.context = definition.context;
		this.domain = definition.domain;
		this.as = definition.as;
		this.I = definition.I;
		this.so = definition.so;
	}

	pushEvent(evt: StepEvent): void {
		this.events.push(evt);
	}

	getEvents(): ReadonlyArray<StepEvent> {
		return this.events;
	}

	getScenarios(): ReadonlyArray<Scenario<any>> {
		return this.scenarios;
	}

	scenario(name: string) {
		return this.withRegistry(() => {
			const scenario = new Scenario(name, this);
			this.scenarios.push(scenario);
			return scenario;
		});
	}

	registerStep(step: Step<any, any>) {
		const reg = this.getRegistry();
		const k = this.makeKey(step.kind, step.name);
		if (!reg.has(k)) reg.set(k, step);
	}

	getStep<C extends object, T extends object>(kind: StepKind, name: string): Step<C, T> | undefined {
		const step = this.getRegistry().get(this.makeKey(kind, name));
		return step as Step<C, T> | undefined;
	}

	getMacroStep<C extends object, T extends object>(kind: StepKind, name: string): Step<C, T> | undefined {
		const macro = this.container.getMacro(name);
		if (!macro) return undefined;
		const step = new Step<C, T>(kind, name, async () => {
			const result = await macro.execute();
			return result as unknown as T;
		});
		return step;
	}

	private makeKey(kind: StepKind, name: string) {
		return `${kind}:${name}`;
	}

	private getRegistry() {
		const store = this.als.getStore();
		if (!store) throw new Error("Step registry not available in current ALS context");
		return store;
	}

	withRegistry<T>(fn: () => T): T {
		return this.als.run(this.registry, fn);
	}

	getName() {
		return this.name;
	}
	getContext() {
		return this.context;
	}
	getDomain() {
		return this.domain;
	}
	getAs() {
		return this.as;
	}
	getI() {
		return this.I;
	}
	getSo() {
		return this.so;
	}

	async test(): Promise<Array<{ scenario: string; context: object }>> {
		const results: Array<{ scenario: string; context: object }> = [];
		for (const scenario of this.scenarios) {
			const context = await this.withRegistry(() => scenario.runAllSteps());
			results.push({ scenario: scenario.name, context });
		}
		return results;
	}
}

export class BddContainer {
	private readonly features: Array<Feature> = [];
	private macroRegistry?: MacroRegistry;

	define(name: string, definition: FeatureDefinition) {
		const feature = new Feature(this, name, definition);
		this.features.push(feature);
		return feature;
	}

	setMacroRegistry(registry: MacroRegistry) {
		this.macroRegistry = registry;
	}

	getMacro(title: string): OrquestraMacro | undefined {
		return this.macroRegistry?.get(title);
	}

	getFeatureMeta(): FeatureMeta[] {
		return this.features.map((f) => ({
			feature: f.getName(),
			context: f.getContext(),
			domain: f.getDomain(),
			as: f.getAs(),
			I: f.getI(),
			so: f.getSo(),
		}));
	}

	getEvents(): StepEvent[] {
		return this.features.flatMap((f) => [...f.getEvents()]);
	}

	getFeatures(): ReadonlyArray<Feature> {
		return this.features;
	}
}
