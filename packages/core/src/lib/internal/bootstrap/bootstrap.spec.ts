import type { IOrquestraContext } from "../../types";
import type { ContainerProvider, ServiceProvider } from "../../types/components";
import type { ModuleDefinition } from "../../types/define";
import { Injectable, IocContainer } from "../ioc-container";
import { Logger } from "../logger";
import { OrquestraContext } from "../orquestra-context";
import { Bootstrap } from "./bootstrap";

function makeBootstrap(): { bs: Bootstrap; ctx: IOrquestraContext; logger: Logger } {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as unknown as Logger;
	const container = new IocContainer(logger);
	const ctx = new OrquestraContext(container);
	const bs = new Bootstrap(ctx, logger);
	return { bs, ctx, logger };
}

describe("Bootstrap.resolve — dedup", () => {
	it("registers each service token only once across modules (#9)", () => {
		const startCalls: string[] = [];
		class Shared extends Injectable {
			async onStart() {
				startCalls.push("Shared");
			}
		}
		const moduleA: ModuleDefinition = {
			services: [Shared],
			__orquestra: "module",
			__token: Symbol("modA"),
		};
		const moduleB: ModuleDefinition = {
			services: [Shared],
			__orquestra: "module",
			__token: Symbol("modB"),
		};
		const { bs } = makeBootstrap();
		bs.resolve({ modules: [moduleA, moduleB] });
		// Indirectly assert dedup by booting and checking onStart was called once.
		return bs.boot().then(() => {
			expect(startCalls).toEqual(["Shared"]);
			return bs.teardown();
		});
	});

	it("dedups macros declared in multiple modules", () => {
		const macroToken = Symbol("macro:shared");
		const macro = {
			title: "shared macro",
			execute: async () => ({}),
			__orquestra: "macro" as const,
			__token: macroToken,
		};
		const moduleA: ModuleDefinition = {
			macros: [macro],
			__orquestra: "module",
			__token: Symbol("a"),
		};
		const moduleB: ModuleDefinition = {
			macros: [macro],
			__orquestra: "module",
			__token: Symbol("b"),
		};
		const { bs } = makeBootstrap();
		bs.resolve({ modules: [moduleA, moduleB] });
		const macros = bs.getMacros();
		expect(macros).toHaveLength(1);
	});
});

describe("Bootstrap.resolve — partial teardown on constructor failure (A8)", () => {
	it("calls onTeardown on already-built services when a later constructor throws", async () => {
		const teardownCalls: string[] = [];
		class GoodA extends Injectable {
			async onTeardown() {
				teardownCalls.push("GoodA");
			}
		}
		class GoodB extends Injectable {
			async onTeardown() {
				teardownCalls.push("GoodB");
			}
		}
		class Boom extends Injectable {
			constructor(ctx: IOrquestraContext) {
				super(ctx);
				throw new Error("ctor failed");
			}
		}
		const services: ServiceProvider[] = [GoodA, GoodB, Boom];
		const { bs } = makeBootstrap();
		expect(() => bs.resolve({ services })).toThrow("ctor failed");

		// teardown is async fire-and-forget inside the catch — give it a tick
		await new Promise((r) => setTimeout(r, 10));
		// reverse order: GoodB, then GoodA
		expect(teardownCalls).toEqual(["GoodB", "GoodA"]);
	});
});

class FakeStartedContainer {
	constructor(public name: string) {}
	stop = vi.fn().mockResolvedValue(undefined);
}

abstract class FakeContainer extends Injectable {
	public containerName: string;
	public startedContainer?: any;
	abstract up(): Promise<any>;
	async start() {
		this.startedContainer = await this.up();
		return this.startedContainer;
	}
	async stop() {
		this.startedContainer = undefined;
	}
	constructor(ctx: IOrquestraContext, name: string) {
		super(ctx);
		this.containerName = name;
	}
}

describe("Bootstrap — conflicting dependsOn (M1)", () => {
	it("logs a warning when the same container is declared with divergent dependsOn", () => {
		class Leaf1 extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "leaf1");
			}
			async up() {
				return new FakeStartedContainer("leaf1");
			}
		}
		class Leaf2 extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "leaf2");
			}
			async up() {
				return new FakeStartedContainer("leaf2");
			}
		}
		class Root extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "root");
			}
			async up() {
				return new FakeStartedContainer("root");
			}
		}
		const containers: ContainerProvider[] = [
			{ container: Root as any, dependsOn: [Leaf1 as any] },
			{ container: Root as any, dependsOn: [Leaf2 as any] },
		];
		const { bs, logger } = makeBootstrap();
		bs.resolve({ containers });
		expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/conflicting dependsOn/));
	});

	it("does NOT warn when dependsOn lists are identical (just declared in two modules)", () => {
		class Leaf extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "leaf");
			}
			async up() {
				return new FakeStartedContainer("leaf");
			}
		}
		class Root extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "root");
			}
			async up() {
				return new FakeStartedContainer("root");
			}
		}
		const containers: ContainerProvider[] = [
			{ container: Root as any, dependsOn: [Leaf as any] },
			{ container: Root as any, dependsOn: [Leaf as any] },
		];
		const { bs, logger } = makeBootstrap();
		bs.resolve({ containers });
		expect(logger.warn).not.toHaveBeenCalledWith(expect.stringMatching(/conflicting dependsOn/));
	});
});

describe("Bootstrap.provisionContainers — fan-out and cycle detection (#1)", () => {
	it("starts a shared dependency only once when multiple roots depend on it", async () => {
		const upCalls: string[] = [];
		class Leaf extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "leaf");
			}
			async up() {
				upCalls.push("leaf");
				await new Promise((r) => setTimeout(r, 5));
				return new FakeStartedContainer("leaf");
			}
		}
		class RootA extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "rootA");
			}
			async up() {
				upCalls.push("rootA");
				return new FakeStartedContainer("rootA");
			}
		}
		class RootB extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "rootB");
			}
			async up() {
				upCalls.push("rootB");
				return new FakeStartedContainer("rootB");
			}
		}
		const containers: ContainerProvider[] = [
			{ container: RootA as any, dependsOn: [Leaf as any] },
			{ container: RootB as any, dependsOn: [Leaf as any] },
		];
		const { bs } = makeBootstrap();
		bs.resolve({ containers });
		await bs.provisionContainers();
		expect(upCalls.filter((c) => c === "leaf")).toHaveLength(1);
		expect(upCalls).toContain("rootA");
		expect(upCalls).toContain("rootB");
	});

	it("rejects with a cycle error when containers form a cycle", async () => {
		class A extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "A");
			}
			async up() {
				return new FakeStartedContainer("A");
			}
		}
		class B extends FakeContainer {
			constructor(ctx: IOrquestraContext) {
				super(ctx, "B");
			}
			async up() {
				return new FakeStartedContainer("B");
			}
		}
		const containers: ContainerProvider[] = [
			{ container: A as any, dependsOn: [{ container: B as any, dependsOn: [A as any] } as any] },
		];
		const { bs } = makeBootstrap();
		bs.resolve({ containers });
		await expect(bs.provisionContainers()).rejects.toThrow(/Circular dependency/);
	});
});
