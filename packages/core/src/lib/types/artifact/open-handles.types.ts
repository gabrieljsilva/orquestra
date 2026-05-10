/**
 * A single stack frame of where an async resource was created. Captured by the
 * runner's open-handles tracker when `--detect-open-handles` is enabled. Only
 * frames inside user code make it here — internals (`node:internal/...`),
 * framework code, and the tracker itself are filtered out.
 */
export interface ArtifactOpenHandleFrame {
	file: string;
	line: number;
	column?: number;
	/** Best-effort source line read from disk. Absent if the file is unreadable. */
	source?: string;
}

/**
 * One async resource that was created during a feature and was still keeping
 * the event loop alive (`hasRef() === true`) when the feature finished.
 *
 * Reported per-feature: only resources created **after** the feature started.
 * Handles inherited from previous features in the same worker (or from
 * framework boot) are attributed to where they were born.
 */
export interface ArtifactOpenHandle {
	/** `async_hooks` resource type, e.g. `"Timeout"`, `"TCPSOCKETWRAP"`. */
	type: string;
	/** Empty when the stack could not be captured (resource created in native code). */
	stack: ArtifactOpenHandleFrame[];
}
