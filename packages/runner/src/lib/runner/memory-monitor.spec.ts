import { bytesToMb, readHeapUsedBytes } from "./memory-monitor";

describe("bytesToMb", () => {
	it("converts a round MB cleanly", () => {
		expect(bytesToMb(1024 * 1024)).toBe(1);
		expect(bytesToMb(512 * 1024 * 1024)).toBe(512);
	});

	it("returns fractional values without rounding", () => {
		expect(bytesToMb(1_500_000)).toBeCloseTo(1.4305, 3);
	});

	it("zero stays zero (safe to compare with limits)", () => {
		expect(bytesToMb(0)).toBe(0);
	});
});

describe("readHeapUsedBytes", () => {
	it("returns the current heapUsed as a positive integer", () => {
		const value = readHeapUsedBytes();
		expect(typeof value).toBe("number");
		expect(value).toBeGreaterThan(0);
		expect(Number.isInteger(value)).toBe(true);
	});

	it("monotonically reports values across calls (no caching)", () => {
		// We don't assert direction — heap can shrink due to GC. We just want
		// to confirm the reader is live (not memoized to a single value).
		const first = readHeapUsedBytes();
		const arr = new Array(100_000).fill("x"); // touch heap
		const second = readHeapUsedBytes();
		expect(second).not.toBe(first);
		expect(arr.length).toBe(100_000);
	});
});
