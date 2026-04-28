import { WorkerOrquestra } from "./worker-orquestra";

describe("WorkerOrquestra — phase tracking (A2)", () => {
	it("rejects beforeStartServer hook registration after that phase has run", async () => {
		const orq = new WorkerOrquestra({});
		await orq.runHooks("beforeStartServer", "FIFO");

		expect(() => orq.registerHook("beforeStartServer", () => undefined)).toThrow(
			/Cannot register "beforeStartServer" hook — that phase has already run/,
		);
	});

	it("allows registering later-phase hooks even after earlier phases ran", async () => {
		const orq = new WorkerOrquestra({});
		await orq.runHooks("beforeStartServer", "FIFO");

		// afterStartServer hasn't run yet — must still be allowed.
		expect(() => orq.registerHook("afterStartServer", () => undefined)).not.toThrow();
	});

	it("rejects useEnv after boot()", async () => {
		const orq = new WorkerOrquestra({});
		await orq.boot();
		expect(() => orq.useEnv({ FOO: "bar" })).toThrow(/Cannot register "beforeStartServer" hook/);
		await orq.shutdown();
	});

	it("phases advance forward only — re-running an earlier hook kind doesn't rewind", async () => {
		const orq = new WorkerOrquestra({});
		await orq.runHooks("afterStartServer", "FIFO");
		// running an earlier kind should not allow registering it again
		await orq.runHooks("beforeStartServer", "FIFO");
		expect(() => orq.registerHook("beforeStartServer", () => undefined)).toThrow();
	});
});
