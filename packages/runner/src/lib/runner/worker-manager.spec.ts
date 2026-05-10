import type { ArtifactOpenHandle } from "@orquestra/core";
import {
	ideAutoAttachActive,
	printOpenHandlesReport,
	resolveExecArgv,
	shouldRecycleWorker,
	stripTerminalEscapes,
} from "./worker-manager";

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
		expect(resolveExecArgv({ debug: false, parentExecArgv: [], parentNodeOptions: undefined })).toEqual([
			"--no-deprecation",
		]);
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

describe("printOpenHandlesReport", () => {
	let captured: string[];
	let originalError: typeof console.error;

	beforeEach(() => {
		captured = [];
		originalError = console.error;
		console.error = (...args: unknown[]) => {
			captured.push(args.map((a) => String(a)).join(" "));
		};
	});

	afterEach(() => {
		console.error = originalError;
	});

	function frame(file: string, line: number, source?: string, column?: number): ArtifactOpenHandle["stack"][number] {
		return { file, line, ...(column !== undefined ? { column } : {}), ...(source !== undefined ? { source } : {}) };
	}

	it("is silent when there are no handles to report (no leak ⇒ no output)", () => {
		printOpenHandlesReport(0, "/p/x.feature.ts", []);
		expect(captured).toEqual([]);
	});

	it("prefixes every report with worker id and feature basename so concurrent output is disambiguated", () => {
		printOpenHandlesReport(3, "/abs/path/payments.feature.ts", [{ type: "Timeout", stack: [] }]);
		expect(captured[0]).toContain("[orquestra][worker 3][payments.feature.ts]");
		// basename only — full path would push the prefix off-screen on long trees.
		expect(captured[0]).not.toContain("/abs/path/");
	});

	it("singular vs plural: 1 handle ⇒ 'handle', 2+ ⇒ 'handles'", () => {
		printOpenHandlesReport(0, "/p/a.feature.ts", [{ type: "Timeout", stack: [] }]);
		expect(captured[0]).toMatch(/1 open handle\b/);
		captured.length = 0;
		printOpenHandlesReport(0, "/p/a.feature.ts", [
			{ type: "Timeout", stack: [] },
			{ type: "TCPSOCKETWRAP", stack: [] },
		]);
		expect(captured[0]).toMatch(/2 open handles\b/);
	});

	it("prints the type, formatted location, and the source line when available", () => {
		printOpenHandlesReport(0, "/p/x.feature.ts", [
			{
				type: "Timeout",
				stack: [frame("/p/src/redis.ts", 42, "this.heartbeat = setInterval(ping, 1000);", 5)],
			},
		]);
		const joined = captured.join("\n");
		expect(joined).toContain("# Timeout");
		expect(joined).toContain("/p/src/redis.ts:42:5");
		expect(joined).toContain("this.heartbeat = setInterval(ping, 1000);");
	});

	it("prints '(stack unavailable)' when a handle has no captured frames (native-only resource)", () => {
		printOpenHandlesReport(0, "/p/x.feature.ts", [{ type: "FSReqCallback", stack: [] }]);
		expect(captured.join("\n")).toContain("(stack unavailable)");
	});

	// Defense against terminal-escape injection: minified bundles or attacker-
	// influenced code can embed ANSI/OSC sequences that hijack the terminal.
	// Stripping the C0/C1 control bytes (ESC, BEL, DEL, …) is sufficient — the
	// residual ASCII payload (e.g. `]0;evil`) renders as harmless plain text.
	it("strips control characters from the type and source line before printing", () => {
		printOpenHandlesReport(0, "/p/x.feature.ts", [
			{
				// `Time\x1b]0;evil\x07out` would set the terminal title to "evil"
				// without the strip.
				type: "Time\x1b]0;evil\x07out",
				stack: [frame("/p/src/a.ts", 1, "const x = `\x1b[2Jhijacked`;\x07")],
			},
		]);
		const joined = captured.join("\n");
		// The two control bytes that *make* the escape sequences are gone.
		expect(joined).not.toContain("\x1b");
		expect(joined).not.toContain("\x07");
		// The printable surroundings still appear — visible diagnostic value
		// is preserved, only the terminal-control payload is neutered.
		expect(joined).toContain("hijacked");
		expect(joined).toContain("evil");
	});

	it("omits the column suffix in the location when column is missing", () => {
		printOpenHandlesReport(0, "/p/x.feature.ts", [{ type: "Timeout", stack: [frame("/p/src/a.ts", 7)] }]);
		const joined = captured.join("\n");
		expect(joined).toContain("/p/src/a.ts:7");
		expect(joined).not.toMatch(/\/p\/src\/a\.ts:7:\d/);
	});
});

describe("stripTerminalEscapes", () => {
	it("removes ANSI CSI sequences (color, cursor, clear screen)", () => {
		expect(stripTerminalEscapes("\x1b[31mred\x1b[0m")).toBe("[31mred[0m");
		// The C0 \x1b is gone but the bracketed payload survives — that's fine,
		// `[31m` printed literally is harmless text.
	});

	it("removes OSC sequences (terminal title hijack)", () => {
		expect(stripTerminalEscapes("safe\x1b]0;hijack\x07tail")).toBe("safe]0;hijacktail");
	});

	it("preserves tab and newline (printable whitespace) and ordinary text", () => {
		expect(stripTerminalEscapes("a\tb\nc")).toBe("a\tb\nc");
	});

	it("removes the DEL byte and C1 controls", () => {
		expect(stripTerminalEscapes("a\x7Fb\x9Fc")).toBe("abc");
	});
});
