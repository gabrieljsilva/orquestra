/**
 * Wraps a Promise with a timeout. Resolves/rejects with the original outcome
 * if it settles before `timeoutMs`, otherwise rejects with a TimeoutError so
 * stuck callbacks don't hang the worker.
 *
 * `timeoutMs <= 0` or `Infinity` disables the timeout — useful for
 * environments where the user explicitly opted out.
 */
export class TimeoutError extends Error {
	readonly label: string;
	readonly timeoutMs: number;

	constructor(label: string, timeoutMs: number) {
		super(`${label} exceeded ${timeoutMs}ms timeout`);
		this.name = "TimeoutError";
		this.label = label;
		this.timeoutMs = timeoutMs;
	}
}

export async function withTimeout<T>(
	work: Promise<T> | (() => Promise<T> | T),
	timeoutMs: number | undefined,
	label: string,
): Promise<T> {
	const promise = typeof work === "function" ? Promise.resolve().then(work) : work;

	if (!timeoutMs || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
		return promise;
	}

	let timer: NodeJS.Timeout | null = null;
	try {
		return await new Promise<T>((resolve, reject) => {
			timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
			promise.then(resolve, reject);
		});
	} finally {
		if (timer) clearTimeout(timer);
	}
}
