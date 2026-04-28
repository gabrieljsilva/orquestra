import { TimeoutError, withTimeout } from "./with-timeout";

describe("withTimeout", () => {
	it("resolves with the original value when work settles before the timeout", async () => {
		const result = await withTimeout(Promise.resolve("ok"), 100, "test");
		expect(result).toBe("ok");
	});

	it("rejects with TimeoutError when work exceeds the timeout", async () => {
		const slow = new Promise<string>((resolve) => {
			setTimeout(() => resolve("late"), 50);
		});
		await expect(withTimeout(slow, 5, "slow op")).rejects.toBeInstanceOf(TimeoutError);
	});

	it("TimeoutError carries label and timeout for diagnostics", async () => {
		const never = new Promise<never>(() => {
			/* never resolves */
		});
		try {
			await withTimeout(never, 5, "stuck hook");
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(TimeoutError);
			const t = err as TimeoutError;
			expect(t.label).toBe("stuck hook");
			expect(t.timeoutMs).toBe(5);
			expect(t.message).toContain("stuck hook");
			expect(t.message).toContain("5ms");
		}
	});

	it("preserves the original rejection when work fails before timeout", async () => {
		const failing = Promise.reject(new Error("boom"));
		await expect(withTimeout(failing, 100, "test")).rejects.toThrow("boom");
	});

	it("disables the timeout when timeoutMs is 0, negative, undefined or Infinity", async () => {
		const slow = new Promise<string>((resolve) => {
			setTimeout(() => resolve("done"), 25);
		});
		await expect(withTimeout(Promise.resolve("a"), 0, "test")).resolves.toBe("a");
		await expect(withTimeout(Promise.resolve("a"), -1, "test")).resolves.toBe("a");
		await expect(withTimeout(Promise.resolve("a"), undefined, "test")).resolves.toBe("a");
		await expect(withTimeout(slow, Number.POSITIVE_INFINITY, "test")).resolves.toBe("done");
	});

	it("accepts a thunk and runs it lazily", async () => {
		let invoked = 0;
		const result = await withTimeout(
			() => {
				invoked += 1;
				return "from-thunk";
			},
			100,
			"thunk",
		);
		expect(result).toBe("from-thunk");
		expect(invoked).toBe(1);
	});

	it("accepts an async thunk", async () => {
		const result = await withTimeout(
			async () => {
				await new Promise((r) => setTimeout(r, 5));
				return 42;
			},
			100,
			"async thunk",
		);
		expect(result).toBe(42);
	});
});
