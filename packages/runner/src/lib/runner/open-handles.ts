import { type AsyncHook, createHook } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ArtifactOpenHandle, ArtifactOpenHandleFrame } from "@orquestra/core";

/**
 * Resource types that `async_hooks` fires for but that have no diagnostic
 * value: `PROMISE` covers every awaited expression in user code (orders of
 * magnitude of noise), `TIMERWRAP` is a shared timer container managed by
 * Node, and the others are short-lived natives that never leak in practice.
 *
 * Same exclusion list used by `why-is-node-running` (the lib Vitest's
 * HangingProcessReporter wraps).
 */
const IGNORED_TYPES = new Set(["PROMISE", "TIMERWRAP", "PerformanceObserver", "RANDOMBYTESREQUEST"]);

interface TrackedEntry {
	type: string;
	callSites: NodeJS.CallSite[];
	resource: { hasRef?: () => boolean };
}

interface SerializedHandle {
	type: string;
	stack: ArtifactOpenHandleFrame[];
}

export class OpenHandlesTracker {
	private hook: AsyncHook | null = null;
	private readonly active = new Map<number, TrackedEntry>();
	private readonly cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	install(): this {
		if (this.hook) return this;
		this.hook = createHook({
			init: (asyncId, type, _triggerId, resource) => {
				if (shouldIgnoreType(type)) return;
				this.active.set(asyncId, {
					type,
					callSites: captureCallSites(),
					resource: resource as { hasRef?: () => boolean },
				});
			},
			destroy: (asyncId) => {
				this.active.delete(asyncId);
			},
		});
		this.hook.enable();
		return this;
	}

	snapshot(): Set<number> {
		return new Set(this.active.keys());
	}

	reportSince(snapshotIds: Set<number>): ArtifactOpenHandle[] {
		const handles: SerializedHandle[] = [];
		for (const [asyncId, entry] of this.active) {
			if (snapshotIds.has(asyncId)) continue;
			if (typeof entry.resource.hasRef === "function" && !entry.resource.hasRef()) continue;
			handles.push({
				type: entry.type,
				stack: filterUserStack(entry.callSites, this.cwd),
			});
		}
		return handles;
	}

	dispose(): void {
		this.hook?.disable();
		this.hook = null;
		this.active.clear();
	}
}

/* ------------------------------------------------------------------------ */
/*  Pure helpers — exported for unit testing without installing the hook.   */
/* ------------------------------------------------------------------------ */

export function shouldIgnoreType(type: string): boolean {
	return IGNORED_TYPES.has(type);
}

// Re-entrance guard: if another consumer of Error.prepareStackTrace (Sentry,
// source-map-support) creates an async resource while mid-formatting its own
// stack, our `init` callback would fire under their prepareStackTrace flow
// and risk leaking our override into their continuation. Returning an empty
// stack from the nested call is preferable to a corrupted global.
let capturing = false;

/**
 * Capture stack as `CallSite[]` via `Error.prepareStackTrace`. The override is
 * local — saved and restored under `try/finally` so a throw mid-capture can't
 * leave the global stuck on our function — and re-entrant calls are skipped.
 */
export function captureCallSites(): NodeJS.CallSite[] {
	if (capturing) return [];
	capturing = true;
	const previous = Error.prepareStackTrace;
	Error.prepareStackTrace = (_err, callSites) => callSites;
	try {
		const target: { stack?: NodeJS.CallSite[] } = {};
		Error.captureStackTrace(target, captureCallSites);
		return target.stack ?? [];
	} finally {
		Error.prepareStackTrace = previous;
		capturing = false;
	}
}

export function filterUserStack(callSites: NodeJS.CallSite[], cwd: string): ArtifactOpenHandleFrame[] {
	const frames: ArtifactOpenHandleFrame[] = [];
	for (const site of callSites) {
		const file = site.getFileName();
		const line = site.getLineNumber();
		if (!file || line === null) continue;
		if (!isUserFrame(file, cwd)) continue;
		const frame: ArtifactOpenHandleFrame = { file, line };
		const column = site.getColumnNumber();
		if (column !== null) frame.column = column;
		const source = readSourceLine(file, line);
		if (source !== undefined) frame.source = source;
		frames.push(frame);
	}
	return frames;
}

function isUserFrame(file: string, cwd: string): boolean {
	if (file.startsWith("node:internal")) return false;
	if (file.startsWith(`internal${sep}`)) return false;
	// Exclude Node built-ins that show up without the `node:` prefix on older
	// builds (e.g. `events.js`).
	if (!file.includes(sep)) return false;
	// Exclude the runner package itself — its frames would point to scaffolding,
	// not the test author's code. `cwd` of the worker is the project's config
	// dir, so the runner lives outside that subtree (in node_modules) and is
	// skipped by the `cwd` prefix check below; this is just defense in depth
	// for monorepo setups where the runner lives alongside the project.
	if (file.includes(`${sep}@orquestra${sep}runner${sep}`)) return false;
	if (file.includes(`${sep}@orquestra${sep}core${sep}`)) return false;
	// Anything outside the project tree (jiti internals, framework deps, etc.)
	// is also noise — the leak originated in user code. `resolve` collapses
	// `..` segments so a forged sourceURL like `${cwd}/../../etc/passwd` (set
	// via `vm.runInThisContext({ filename })` in a malicious feature) cannot
	// pass the prefix check and trigger arbitrary file reads in the artifact.
	const normalized = resolve(file);
	const cwdPrefix = resolve(cwd) + sep;
	return normalized === resolve(cwd) || normalized.startsWith(cwdPrefix);
}

// Hard cap on the source snippet length. Bundled / minified user code can put
// the entire program on a single line — without a cap each frame would carry
// MBs of source over IPC and into the artifact, dwarfing the diagnostic.
const MAX_SOURCE_LENGTH = 500;

export function readSourceLine(file: string, line: number): string | undefined {
	try {
		const content = readFileSync(file, "utf8");
		const lines = content.split(/\r?\n/);
		const raw = lines[line - 1];
		if (raw === undefined) return undefined;
		const trimmed = raw.trim();
		if (trimmed.length <= MAX_SOURCE_LENGTH) return trimmed;
		return `${trimmed.slice(0, MAX_SOURCE_LENGTH)}…`;
	} catch {
		return undefined;
	}
}
