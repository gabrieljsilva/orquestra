/**
 * Wraps a Promise with a timeout. Resolves/rejects with the original outcome
 * if it settles before `timeoutMs`, otherwise rejects with a TimeoutError so
 * stuck callbacks don't hang the worker.
 *
 * `timeoutMs <= 0` or `Infinity` disables the timeout — useful for
 * environments where the user explicitly opted out.
 *
 * `tuneKnob` is the user-facing config name to recommend in the error
 * message — passing it turns "X exceeded 5000ms timeout" into a message
 * that points the dev to the right knob to bump (e.g. `scenarioTimeoutMs`).
 */
export class TimeoutError extends Error {
	readonly label: string;
	readonly timeoutMs: number;
	readonly tuneKnob?: string;

	constructor(label: string, timeoutMs: number, tuneKnob?: string) {
		const hint = tuneKnob ? ` — raise \`${tuneKnob}\` if this is expected.` : "";
		super(`${label} exceeded ${timeoutMs}ms timeout${hint}`);
		this.name = "TimeoutError";
		this.label = label;
		this.timeoutMs = timeoutMs;
		this.tuneKnob = tuneKnob;
	}
}

export interface WithTimeoutOptions {
	/** Config field a developer would tune to give this call more headroom. */
	tuneKnob?: string;
}

export async function withTimeout<T>(
	work: Promise<T> | (() => Promise<T> | T),
	timeoutMs: number | undefined,
	label: string,
	options?: WithTimeoutOptions,
): Promise<T> {
	const promise = typeof work === "function" ? Promise.resolve().then(work) : work;

	if (!timeoutMs || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
		return promise;
	}

	let timer: NodeJS.Timeout | null = null;
	try {
		return await new Promise<T>((resolve, reject) => {
			timer = setTimeout(
				() => reject(new TimeoutError(label, timeoutMs, options?.tuneKnob)),
				timeoutMs,
			);
			promise.then(resolve, reject);
		});
	} finally {
		if (timer) clearTimeout(timer);
	}
}
