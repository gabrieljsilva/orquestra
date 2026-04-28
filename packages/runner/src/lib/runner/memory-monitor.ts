/**
 * Reads the worker's current heap usage. Isolated so the worker can mock it
 * in tests without monkey-patching `process.memoryUsage` globally.
 */
export type HeapUsageReader = () => number;

export const readHeapUsedBytes: HeapUsageReader = () => process.memoryUsage().heapUsed;

export function bytesToMb(bytes: number): number {
	return bytes / (1024 * 1024);
}
