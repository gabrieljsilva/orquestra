import { AsyncLocalStorage } from "node:async_hooks";
import type { FeatureDefinition } from "../../types/bdd";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";
import { OrquestraShardManager } from "../orquestra-shard-manager";
import { BddRunner } from "./bdd.runner";

export enum StepKind {
	GIVEN = "GIVEN",
	WHEN = "WHEN",
	THEN = "THEN",
}

export type Awaitable<T> = T | Promise<T>;

type StepFn<C extends object, T extends object> = (ctx: Readonly<C>) => Awaitable<T>;

export class Step<C extends object, T extends object> {
	kind: StepKind;
	name: string;
	fn: StepFn<C, T>;

	constructor(kind: StepKind, name: string, fn: StepFn<C, T>) {
		this.kind = kind;
		this.name = name;
		this.fn = fn;
	}

	async run(ctx: C): Promise<T> {
		return this.fn(Object.freeze({ ...ctx }) as Readonly<C>);
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

	given<T extends object>(name: string, fn: StepFn<C, T>): Scenario<C & T>;
	given<T extends object = never>(name: string): Scenario<C & (T extends never ? {} : T)>;
	given<T extends object>(name: string, fn?: StepFn<C, T>): Scenario<any> {
		return this.feature.withRegistry(() => {
			if (fn) {
				const step = new Step<C, T>(StepKind.GIVEN, name, fn);
				this.steps.push(step);
				this.feature.registerStep(step);
				return this as unknown as Scenario<C & T>;
			}
			const existing = this.feature.getStep<C, T>(StepKind.GIVEN, name);
			if (!existing) throw new Error(`Step not found: ${name}`);
			this.steps.push(existing);
			return this as unknown as Scenario<C & T>;
		});
	}

	when<T extends object>(name: string, fn: StepFn<C, T>): Scenario<C & T>;
	when<T extends object = never>(name: string): Scenario<C & (T extends never ? {} : T)>;
	when<T extends object>(name: string, fn?: StepFn<C, T>): Scenario<any> {
		return this.feature.withRegistry(() => {
			if (fn) {
				const step = new Step<C, T>(StepKind.WHEN, name, fn);
				this.steps.push(step);
				this.feature.registerStep(step);
				return this as unknown as Scenario<C & T>;
			}
			const existing = this.feature.getStep<C, T>(StepKind.WHEN, name);
			if (!existing) throw new Error(`Step not found: ${name}`);
			this.steps.push(existing);
			return this as unknown as Scenario<C & T>;
		});
	}

	then<T extends object>(name: string, fn: StepFn<C, T>): Scenario<C & T>;
	then<T extends object = never>(name: string): Scenario<C & (T extends never ? {} : T)>;
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
			if (!existing) throw new Error(`Step not found: ${name}`);
			this.steps.push(existing);
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
	private as: string;
	private I: string;
	private so: string;
	private scenarios: Array<Scenario<any>> = [];
	private registry: Map<string, Step<any, any>> = new Map();
	private readonly als = new AsyncLocalStorage<Map<string, Step<any, any>>>();
	private readonly collectTimestamps: Map<string, string> = new Map();

	constructor(container: BddContainer, name: string, definition: FeatureDefinition) {
		const { as, I, so } = definition;
		this.container = container;
		this.name = name;
		this.as = as;
		this.I = I;
		this.so = so;
	}

	getRunId(): string {
		return this.container.getRunId();
	}

	writeEvent(evt: StepEvent): void {
		this.container.writeEvent(evt);
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

	async collect(): Promise<void> {
		await BddRunner.collect(this);
	}

	getName() {
		return this.name;
	}
	getCollectTs(stepId: string) {
		return this.collectTimestamps.get(stepId);
	}

	async test(): Promise<Array<{ scenario: string; context: object }>> {
		await this.collect();
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
	private readonly shards: OrquestraShardManager = new OrquestraShardManager();

	getRunId(): string {
		return this.shards.getRunId();
	}

	writeEvent(evt: StepEvent): void {
		this.shards.write(evt);
	}

	define(name: string, definition: FeatureDefinition) {
		const feature = new Feature(this, name, definition);
		this.features.push(feature);
		return feature;
	}
}
