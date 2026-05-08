import { defineMacro } from "../define/define-macro";
import { StepKind } from "../internal/orquestra-bdd-container";
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

describe("WorkerOrquestra — buildMacroStep (macros with input)", () => {
	it("forwards the accumulated scenario context as the macro input", async () => {
		const seenInputs: unknown[] = [];
		const macro = defineMacro<{ greeting: string }, { user: { id: number } }>({
			title: "echo macro",
			execute: async (_hookCtx, input) => {
				seenInputs.push(input);
				return { greeting: `hello-${input.user.id}` };
			},
		});

		const orq = new WorkerOrquestra({ macros: [macro] });
		const step = orq.getBddContainer().resolveMacroStep(StepKind.GIVEN, "echo macro");
		const result = await step!.run({ user: { id: 42 } });

		expect(seenInputs).toEqual([{ user: { id: 42 } }]);
		expect(result).toEqual({ greeting: "hello-42" });
	});

	it("returns the macro output so the runner can merge it into the scenario context", async () => {
		const macro = defineMacro<{ token: string }>({
			title: "produces token",
			execute: async () => ({ token: "abc" }),
		});

		const orq = new WorkerOrquestra({ macros: [macro] });
		const step = orq.getBddContainer().resolveMacroStep(StepKind.GIVEN, "produces token");
		const result = await step!.run({});

		expect(result).toEqual({ token: "abc" });
	});

	it("legacy macros that ignore the input keep working unchanged", async () => {
		let calls = 0;
		const macro = defineMacro({
			title: "no input macro",
			execute: async () => {
				calls++;
			},
		});

		const orq = new WorkerOrquestra({ macros: [macro] });
		const step = orq.getBddContainer().resolveMacroStep(StepKind.GIVEN, "no input macro");
		const result = await step!.run({ unrelated: "ignored" });

		expect(calls).toBe(1);
		expect(result).toBeUndefined();
	});

	it("prefixes a thrown Error with the macro title and preserves the original stack", async () => {
		const original = new Error("boom");
		const originalStack = original.stack;
		const macro = defineMacro({
			title: "failing macro",
			execute: async () => {
				throw original;
			},
		});

		const orq = new WorkerOrquestra({ macros: [macro] });
		const step = orq.getBddContainer().resolveMacroStep(StepKind.GIVEN, "failing macro");

		await expect(step!.run({})).rejects.toThrow('[macro "failing macro"] boom');
		expect(original.message).toBe('[macro "failing macro"] boom');
		expect(original.stack).toBe(originalStack);
	});

	it("does not double-prefix when the error message already starts with the macro title", async () => {
		const macro = defineMacro({
			title: "already prefixed",
			execute: async () => {
				throw new Error('[macro "already prefixed"] preformatted');
			},
		});

		const orq = new WorkerOrquestra({ macros: [macro] });
		const step = orq.getBddContainer().resolveMacroStep(StepKind.GIVEN, "already prefixed");

		await expect(step!.run({})).rejects.toThrow(/^\[macro "already prefixed"\] preformatted$/);
	});

	it("wraps non-Error throws into an Error with the macro prefix", async () => {
		const macro = defineMacro({
			title: "throws string",
			execute: async () => {
				throw "raw failure";
			},
		});

		const orq = new WorkerOrquestra({ macros: [macro] });
		const step = orq.getBddContainer().resolveMacroStep(StepKind.GIVEN, "throws string");

		await expect(step!.run({})).rejects.toThrow('[macro "throws string"] raw failure');
	});
});
