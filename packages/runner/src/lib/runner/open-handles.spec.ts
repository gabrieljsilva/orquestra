import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	OpenHandlesTracker,
	captureCallSites,
	filterUserStack,
	readSourceLine,
	shouldIgnoreType,
} from "./open-handles";

describe("shouldIgnoreType", () => {
	// `PROMISE` and `TIMERWRAP` fire on every awaited expression and shared timer
	// buckets — keeping them would drown the report in noise.
	it.each(["PROMISE", "TIMERWRAP", "PerformanceObserver", "RANDOMBYTESREQUEST"])(
		"ignores noisy native type %s",
		(type) => {
			expect(shouldIgnoreType(type)).toBe(true);
		},
	);

	it.each(["Timeout", "TCPSOCKETWRAP", "FSReqCallback", "Immediate"])("keeps actionable type %s", (type) => {
		expect(shouldIgnoreType(type)).toBe(false);
	});
});

describe("readSourceLine", () => {
	let tmp: string;

	beforeAll(() => {
		tmp = mkdtempSync(join(tmpdir(), "orquestra-open-handles-"));
	});

	afterAll(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it("reads the requested 1-indexed line, trimmed", () => {
		const file = join(tmp, "sample.ts");
		writeFileSync(file, "const a = 1;\n  const b = 2;\nconst c = 3;\n");
		expect(readSourceLine(file, 2)).toBe("const b = 2;");
	});

	it("returns undefined when the line is past EOF", () => {
		const file = join(tmp, "short.ts");
		writeFileSync(file, "only one\n");
		expect(readSourceLine(file, 99)).toBeUndefined();
	});

	it("returns undefined when the file is unreadable instead of throwing", () => {
		expect(readSourceLine(join(tmp, "does-not-exist.ts"), 1)).toBeUndefined();
	});

	// Bundled/minified code is the realistic worst case — a single 5MB line would
	// blow up the IPC payload and the artifact without a cap.
	it("truncates very long lines with an ellipsis to keep the report bounded", () => {
		const file = join(tmp, "minified.js");
		writeFileSync(file, `${"a".repeat(2000)}\n`);
		const result = readSourceLine(file, 1);
		expect(result).toBeDefined();
		expect((result as string).length).toBeLessThanOrEqual(501);
		expect(result?.endsWith("…")).toBe(true);
	});
});

describe("filterUserStack", () => {
	const cwd = "/home/dev/project";

	function fakeFrame(file: string | null, line: number, column: number | null = 7): NodeJS.CallSite {
		// Only the methods filterUserStack reads — keeps the fixture tiny and
		// independent of V8's CallSite shape.
		return {
			getFileName: () => file,
			getLineNumber: () => line,
			getColumnNumber: () => column,
		} as unknown as NodeJS.CallSite;
	}

	it("drops frames without filename or line", () => {
		const sites = [fakeFrame(null, 10), fakeFrame(`${cwd}/src/foo.ts`, null as unknown as number)];
		expect(filterUserStack(sites, cwd)).toEqual([]);
	});

	it("drops node:internal and bare-name builtins (events.js)", () => {
		const sites = [
			fakeFrame("node:internal/timers", 12),
			fakeFrame("internal/process/task_queues.js", 4),
			fakeFrame("events.js", 2),
		];
		expect(filterUserStack(sites, cwd)).toEqual([]);
	});

	it("drops frames inside @orquestra/runner and @orquestra/core (defense in depth for monorepo setups)", () => {
		const sites = [
			fakeFrame("/somewhere/node_modules/@orquestra/runner/dist/worker.js", 100),
			fakeFrame("/somewhere/node_modules/@orquestra/core/dist/index.js", 200),
		];
		expect(filterUserStack(sites, cwd)).toEqual([]);
	});

	it("drops frames outside the project tree (jiti, deps, etc.)", () => {
		const sites = [fakeFrame("/usr/local/lib/jiti/dist/jiti.cjs", 50)];
		expect(filterUserStack(sites, cwd)).toEqual([]);
	});

	// A malicious feature could set a forged sourceURL via vm.runInThisContext({
	// filename: "/home/dev/project/../../etc/passwd" }) so the raw string starts
	// with cwd but resolves outside it. Path normalization defeats the bypass.
	it("rejects forged paths that escape the project via `..` segments after normalization", () => {
		const sites = [fakeFrame(`${cwd}/../../etc/passwd`, 1), fakeFrame(`${cwd}/legit/../../../outside.ts`, 1)];
		expect(filterUserStack(sites, cwd)).toEqual([]);
	});

	it("keeps frames inside the project tree, with column when available", () => {
		const sites = [fakeFrame(`${cwd}/src/services/redis.ts`, 42, 13)];
		const frames = filterUserStack(sites, cwd);
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ file: `${cwd}/src/services/redis.ts`, line: 42, column: 13 });
	});

	it("omits column when getColumnNumber returns null", () => {
		const sites = [fakeFrame(`${cwd}/src/x.ts`, 1, null)];
		expect(filterUserStack(sites, cwd)[0]).not.toHaveProperty("column");
	});
});

describe("captureCallSites", () => {
	it("returns the raw V8 CallSites — own frame is the bottom of the stack so callers can filter it out", () => {
		const sites = captureCallSites();
		expect(Array.isArray(sites)).toBe(true);
		expect(sites.length).toBeGreaterThan(0);
		// The function captures the stack of the test runner itself; the first
		// frame's filename should be a real file path (not null).
		expect(typeof sites[0].getFileName()).toBe("string");
	});

	it("restores Error.prepareStackTrace after running (does not poison the global)", () => {
		const sentinel = (_err: Error, _stack: NodeJS.CallSite[]) => "sentinel-output";
		const previous = Error.prepareStackTrace;
		Error.prepareStackTrace = sentinel;
		try {
			captureCallSites();
			expect(Error.prepareStackTrace).toBe(sentinel);
		} finally {
			Error.prepareStackTrace = previous;
		}
	});

	// Re-entrant call (e.g. another consumer of prepareStackTrace creates an
	// async resource while formatting its stack) must not corrupt the global.
	// We simulate re-entrance by making Error.captureStackTrace itself invoke
	// captureCallSites recursively — this is the only way to trigger the path
	// without actually creating an async resource mid-formatter.
	it("returns an empty stack on a re-entrant call (guard prevents nested override)", () => {
		const originalCaptureStackTrace = Error.captureStackTrace;
		let nestedResult: NodeJS.CallSite[] | "not-called" = "not-called";
		Error.captureStackTrace = function patched(target: object, ctor?: Function) {
			if (nestedResult === "not-called") {
				nestedResult = captureCallSites();
			}
			return originalCaptureStackTrace.call(Error, target, ctor);
		} as typeof Error.captureStackTrace;
		try {
			captureCallSites();
			expect(nestedResult).toEqual([]);
		} finally {
			Error.captureStackTrace = originalCaptureStackTrace;
		}
	});
});

describe("OpenHandlesTracker", () => {
	let tracker: OpenHandlesTracker;

	afterEach(() => {
		tracker?.dispose();
	});

	it("install() returns the tracker instance for chaining and is idempotent", () => {
		tracker = new OpenHandlesTracker();
		expect(tracker.install()).toBe(tracker);
		// Second install must not throw or double-enable; the second snapshot
		// would otherwise risk capturing the hook's own setup as a leak.
		expect(() => tracker.install()).not.toThrow();
	});

	it("reports a leaked setInterval as a handle whose snapshot was taken before it existed", async () => {
		tracker = new OpenHandlesTracker(process.cwd()).install();

		const before = tracker.snapshot();
		const interval = setInterval(() => {}, 60_000);
		// Yield once so async_hooks `init` fires before we read the report.
		await new Promise((resolve) => setImmediate(resolve));

		const handles = tracker.reportSince(before);
		clearInterval(interval);

		expect(handles.length).toBeGreaterThan(0);
		expect(handles.some((h) => h.type === "Timeout")).toBe(true);
	});

	it("does not report handles that existed in the baseline snapshot", async () => {
		tracker = new OpenHandlesTracker(process.cwd()).install();

		const interval = setInterval(() => {}, 60_000);
		await new Promise((resolve) => setImmediate(resolve));
		const baseline = tracker.snapshot();

		// No new handles between baseline and report — interval is in the
		// baseline, so the delta must be empty.
		const handles = tracker.reportSince(baseline);
		clearInterval(interval);

		expect(handles.filter((h) => h.type === "Timeout")).toEqual([]);
	});

	it("filters out handles whose `hasRef()` returns false (unref'd timers don't keep the loop alive)", async () => {
		tracker = new OpenHandlesTracker(process.cwd()).install();
		const before = tracker.snapshot();
		const interval = setInterval(() => {}, 60_000).unref();
		await new Promise((resolve) => setImmediate(resolve));

		const handles = tracker.reportSince(before);
		clearInterval(interval);

		expect(handles.some((h) => h.type === "Timeout")).toBe(false);
	});

	it("dispose() disables the hook and clears state — a post-dispose snapshot is empty", async () => {
		tracker = new OpenHandlesTracker(process.cwd()).install();
		const interval = setInterval(() => {}, 60_000);
		await new Promise((resolve) => setImmediate(resolve));
		tracker.dispose();

		expect(tracker.snapshot().size).toBe(0);
		clearInterval(interval);
	});
});
