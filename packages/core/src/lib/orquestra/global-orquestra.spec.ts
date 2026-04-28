import type { StartedTestContainer } from "testcontainers";
import { OrquestraContainer } from "../internal/orquestra-container";
import { GlobalOrquestra } from "./global-orquestra";

/**
 * Minimal stub container — `up()` returns a fake StartedTestContainer that
 * just resolves on stop(). Lets us exercise the lifecycle without docker.
 */
class StubContainer extends OrquestraContainer<StartedTestContainer> {
	public containerName = "stub";
	public static instances: StubContainer[] = [];

	constructor() {
		super();
		StubContainer.instances.push(this);
	}

	async up(): Promise<StartedTestContainer> {
		return {
			stop: async () => {},
		} as unknown as StartedTestContainer;
	}
}

const silentLogger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

beforeEach(() => {
	StubContainer.instances = [];
});

describe("GlobalOrquestra — provision/deprovision lifecycle", () => {
	it("runs beforeProvision, provisions, runs afterProvision in order", async () => {
		const order: string[] = [];

		const orq = new GlobalOrquestra({
			containers: [
				{
					container: {
						provide: StubContainer,
						useFactory: () => {
							order.push("provision");
							return new StubContainer();
						},
					},
				},
			],
			beforeProvision: [async () => void order.push("before")],
			afterProvision: [async () => void order.push("after")],
			logger: silentLogger,
		});

		await orq.provision();
		expect(order).toEqual(["before", "provision", "after"]);
	});

	it("runs beforeDeprovision and afterDeprovision around container teardown", async () => {
		const order: string[] = [];

		const orq = new GlobalOrquestra({
			containers: [StubContainer],
			beforeDeprovision: [async () => void order.push("before-deprovision")],
			afterDeprovision: [async () => void order.push("after-deprovision")],
			logger: silentLogger,
		});

		await orq.provision();
		await orq.deprovision();
		expect(order).toEqual(["before-deprovision", "after-deprovision"]);
	});

	it("runs multiple hooks of the same kind in declaration order", async () => {
		const order: string[] = [];

		const orq = new GlobalOrquestra({
			containers: [],
			afterProvision: [
				async () => void order.push("a"),
				async () => void order.push("b"),
				async () => void order.push("c"),
			],
			logger: silentLogger,
		});

		await orq.provision();
		expect(order).toEqual(["a", "b", "c"]);
	});

	it("aborts the run when beforeProvision throws — provisioning is dead, no point continuing", async () => {
		const orq = new GlobalOrquestra({
			containers: [StubContainer],
			beforeProvision: [
				async () => {
					throw new Error("env validation failed");
				},
			],
			logger: silentLogger,
		});

		await expect(orq.provision()).rejects.toThrow(/global hook beforeProvision failed/);
		// Container must NOT have been instantiated since beforeProvision aborted.
		expect(StubContainer.instances.length).toBe(0);
	});

	it("aborts the run when afterProvision throws (setup-side hooks are fail-fast)", async () => {
		const orq = new GlobalOrquestra({
			containers: [StubContainer],
			afterProvision: [
				async () => {
					throw new Error("template DB build failed");
				},
			],
			logger: silentLogger,
		});

		await expect(orq.provision()).rejects.toThrow(/global hook afterProvision failed/);
	});

	it("does NOT abort when beforeDeprovision throws — cleanup must always run to the end", async () => {
		const order: string[] = [];

		const orq = new GlobalOrquestra({
			containers: [
				{
					container: {
						provide: StubContainer,
						useFactory: () => {
							const c = new StubContainer();
							const original = c.stop.bind(c);
							c.stop = async () => {
								order.push("container-stop");
								await original();
							};
							return c;
						},
					},
				},
			],
			beforeDeprovision: [
				async () => {
					order.push("before-deprovision-throws");
					throw new Error("dump failed");
				},
			],
			afterDeprovision: [async () => void order.push("after-deprovision")],
			logger: silentLogger,
		});

		await orq.provision();
		await expect(orq.deprovision()).resolves.toBeUndefined();
		expect(order).toEqual(["before-deprovision-throws", "container-stop", "after-deprovision"]);
	});

	it("hook ctx exposes env and container.get but NO http (main process owns no HTTP server)", async () => {
		let capturedCtx: any = null;

		const orq = new GlobalOrquestra({
			containers: [],
			afterProvision: [
				async (ctx) => {
					capturedCtx = ctx;
				},
			],
			logger: silentLogger,
		});

		await orq.provision();

		expect(capturedCtx).not.toBeNull();
		expect(typeof capturedCtx.env).toBe("object");
		expect(typeof capturedCtx.get).toBe("function");
		expect(capturedCtx.container).toBeDefined();
		// The narrower context is a deliberate part of the API contract —
		// global hooks are NOT worker hooks. Don't add `http` here.
		expect(capturedCtx.http).toBeUndefined();
	});

	it("times out a hook that exceeds hookTimeoutMs and the timeout error mentions the knob", async () => {
		const orq = new GlobalOrquestra({
			containers: [],
			afterProvision: [
				() =>
					new Promise(() => {
						/* never resolves */
					}),
			],
			hookTimeoutMs: 25,
			logger: silentLogger,
		});

		await expect(orq.provision()).rejects.toThrow(/serverHookTimeoutMs/);
	});

	it("a single function (not an array) is also valid — convenience for one-off hooks", async () => {
		const seen: string[] = [];

		const orq = new GlobalOrquestra({
			containers: [],
			afterProvision: [async () => void seen.push("hit")],
			logger: silentLogger,
		});

		await orq.provision();
		expect(seen).toEqual(["hit"]);
	});

	it("no hooks configured: provision/deprovision still complete cleanly (legacy behavior)", async () => {
		const orq = new GlobalOrquestra({
			containers: [],
			logger: silentLogger,
		});

		await expect(orq.provision()).resolves.toBeUndefined();
		await expect(orq.deprovision()).resolves.toBeUndefined();
	});
});
