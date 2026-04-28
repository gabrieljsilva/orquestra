import { ideAutoAttachActive, resolveExecArgv, shouldRecycleWorker } from "./worker-manager";

describe("ideAutoAttachActive", () => {
	it("detects --inspect-publish-uid in NODE_OPTIONS (Cursor / VS Code auto-attach)", () => {
		expect(ideAutoAttachActive("--require bootloader.js --inspect-publish-uid=http")).toBe(true);
	});

	it("returns false when NODE_OPTIONS is missing or empty", () => {
		expect(ideAutoAttachActive(undefined)).toBe(false);
		expect(ideAutoAttachActive("")).toBe(false);
	});

	it("returns false for plain --inspect (manual node --inspect-brk run, not IDE)", () => {
		expect(ideAutoAttachActive("--inspect")).toBe(false);
		expect(ideAutoAttachActive("--inspect-brk=9229")).toBe(false);
	});
});

describe("resolveExecArgv", () => {
	it("non-debug + clean parent: just --no-deprecation", () => {
		expect(
			resolveExecArgv({ debug: false, parentExecArgv: [], parentNodeOptions: undefined }),
		).toEqual(["--no-deprecation"]);
	});

	it("non-debug + parent has --inspect: forwards inspector flags so manual `node --inspect orquestra` works", () => {
		expect(
			resolveExecArgv({
				debug: false,
				parentExecArgv: ["--inspect-brk=9229", "--no-warnings"],
				parentNodeOptions: undefined,
			}),
		).toEqual(["--inspect-brk=9229", "--no-deprecation"]);
	});

	it("debug + standalone: --inspect-brk=0 so the worker pauses before user code", () => {
		const argv = resolveExecArgv({ debug: true, parentExecArgv: [], parentNodeOptions: undefined });
		// The exact order matters: V8 needs --inspect-brk before user code, and
		// --enable-source-maps must be present so breakpoints land on .ts.
		expect(argv).toContain("--inspect-brk=0");
		expect(argv).toContain("--enable-source-maps");
		expect(argv).toContain("--no-deprecation");
	});

	it("debug + IDE auto-attach: NO --inspect-brk (would race with the IDE bootloader and hang the worker)", () => {
		const argv = resolveExecArgv({
			debug: true,
			parentExecArgv: [],
			parentNodeOptions: "--require bootloader.js --inspect-publish-uid=http",
		});
		// This is the regression we just shipped a fix for — keep a guard.
		expect(argv).not.toContain("--inspect-brk=0");
		expect(argv).toContain("--enable-source-maps");
	});
});

describe("shouldRecycleWorker", () => {
	const baseInput = {
		heapUsedBytes: 600 * 1024 * 1024, // 600MB
		limitMb: 512,
		queueLength: 5,
		shuttingDown: false,
		recyclePending: false,
	};

	it("recycles when heap exceeds limit and queue still has work", () => {
		expect(shouldRecycleWorker(baseInput)).toBe(true);
	});

	it("never recycles when limit is unset (defense in depth — no overhead path)", () => {
		expect(shouldRecycleWorker({ ...baseInput, limitMb: undefined })).toBe(false);
		expect(shouldRecycleWorker({ ...baseInput, limitMb: 0 })).toBe(false);
	});

	it("doesn't recycle when heap is below the limit", () => {
		expect(shouldRecycleWorker({ ...baseInput, heapUsedBytes: 100 * 1024 * 1024 })).toBe(false);
	});

	it("doesn't recycle when heapUsedBytes wasn't reported (worker didn't opt in)", () => {
		expect(shouldRecycleWorker({ ...baseInput, heapUsedBytes: undefined })).toBe(false);
	});

	it("doesn't recycle when the manager is already shutting down", () => {
		expect(shouldRecycleWorker({ ...baseInput, shuttingDown: true })).toBe(false);
	});

	it("doesn't recycle a worker that is already draining", () => {
		expect(shouldRecycleWorker({ ...baseInput, recyclePending: true })).toBe(false);
	});

	it("doesn't recycle when the queue is empty (no point spinning a fresh fork)", () => {
		expect(shouldRecycleWorker({ ...baseInput, queueLength: 0 })).toBe(false);
	});

	it("recycles exactly at the threshold (>=, not >)", () => {
		const exact = { ...baseInput, heapUsedBytes: 512 * 1024 * 1024 };
		expect(shouldRecycleWorker(exact)).toBe(true);
	});
});
