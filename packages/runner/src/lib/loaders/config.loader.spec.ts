import { validateConfig } from "./config.loader";

describe("validateConfig — V3 surface", () => {
	it("accepts an empty object (no fields → no validation triggered)", () => {
		expect(() => validateConfig({})).not.toThrow();
	});

	it("rejects non-object configs with a clear message", () => {
		expect(() => validateConfig(null)).toThrow(/must export an object/);
		expect(() => validateConfig(undefined)).toThrow(/must export an object/);
		expect(() => validateConfig(42)).toThrow(/must export an object/);
	});

	describe("granular timeouts", () => {
		it.each(["scenarioTimeoutMs", "eachHookTimeoutMs", "serverHookTimeoutMs"] as const)(
			"%s accepts a positive number",
			(key) => {
				expect(() => validateConfig({ [key]: 500 })).not.toThrow();
			},
		);

		it.each(["scenarioTimeoutMs", "eachHookTimeoutMs", "serverHookTimeoutMs"] as const)(
			"%s rejects zero, negatives and non-finite values with a message that names the knob",
			(key) => {
				expect(() => validateConfig({ [key]: 0 })).toThrow(new RegExp(`${key} must be a positive number`));
				expect(() => validateConfig({ [key]: -10 })).toThrow(key);
				expect(() => validateConfig({ [key]: Number.POSITIVE_INFINITY })).toThrow(key);
				expect(() => validateConfig({ [key]: "soon" })).toThrow(key);
			},
		);
	});

	describe("workerMemoryLimitMb", () => {
		it("accepts a positive number", () => {
			expect(() => validateConfig({ workerMemoryLimitMb: 512 })).not.toThrow();
		});

		it("rejects zero, negatives and non-finite", () => {
			expect(() => validateConfig({ workerMemoryLimitMb: 0 })).toThrow(/workerMemoryLimitMb/);
			expect(() => validateConfig({ workerMemoryLimitMb: -1 })).toThrow(/workerMemoryLimitMb/);
			expect(() => validateConfig({ workerMemoryLimitMb: "lots" })).toThrow(/workerMemoryLimitMb/);
		});

		it("undefined is fine — feature is opt-in", () => {
			expect(() => validateConfig({ workerMemoryLimitMb: undefined })).not.toThrow();
		});
	});

	describe("detectOpenHandles", () => {
		it("accepts true and false", () => {
			expect(() => validateConfig({ detectOpenHandles: true })).not.toThrow();
			expect(() => validateConfig({ detectOpenHandles: false })).not.toThrow();
		});

		it("undefined is fine — feature is opt-in", () => {
			expect(() => validateConfig({ detectOpenHandles: undefined })).not.toThrow();
		});

		it("rejects non-booleans (strings, numbers, objects)", () => {
			expect(() => validateConfig({ detectOpenHandles: "yes" })).toThrow(/detectOpenHandles must be a boolean/);
			expect(() => validateConfig({ detectOpenHandles: 1 })).toThrow(/detectOpenHandles must be a boolean/);
			expect(() => validateConfig({ detectOpenHandles: {} })).toThrow(/detectOpenHandles must be a boolean/);
		});
	});

	describe("global hooks", () => {
		it.each(["beforeProvision", "afterProvision", "beforeDeprovision", "afterDeprovision"] as const)(
			"global.%s accepts a single function",
			(key) => {
				expect(() => validateConfig({ global: { [key]: async () => {} } })).not.toThrow();
			},
		);

		it.each(["beforeProvision", "afterProvision", "beforeDeprovision", "afterDeprovision"] as const)(
			"global.%s accepts an array of functions",
			(key) => {
				expect(() => validateConfig({ global: { [key]: [async () => {}, async () => {}] } })).not.toThrow();
			},
		);

		it.each(["beforeProvision", "afterProvision", "beforeDeprovision", "afterDeprovision"] as const)(
			"global.%s rejects non-callables",
			(key) => {
				const re = new RegExp(`global\\.${key} must be a function or an array of functions`);
				expect(() => validateConfig({ global: { [key]: "not a fn" } })).toThrow(re);
				expect(() => validateConfig({ global: { [key]: 42 } })).toThrow(re);
				expect(() => validateConfig({ global: { [key]: { not: "callable" } } })).toThrow(re);
				expect(() => validateConfig({ global: { [key]: [async () => {}, "stowaway"] } })).toThrow(re);
			},
		);

		it("ignores global keys that aren't recognized hooks (forward compatibility)", () => {
			expect(() => validateConfig({ global: { containers: [], somethingFutureProof: 7 } })).not.toThrow();
		});
	});

	describe("flat-vs-{global,worker} mutual exclusion (preserved from v2.next)", () => {
		it("mixing both shapes is rejected", () => {
			expect(() => validateConfig({ global: {}, worker: {}, plugins: ["x"] })).toThrow(/Cannot mix/);
		});

		it("global+worker without flat is fine", () => {
			expect(() => validateConfig({ global: {}, worker: {} })).not.toThrow();
		});
	});

	describe("concurrency", () => {
		it("accepts positive integers", () => {
			expect(() => validateConfig({ concurrency: 4 })).not.toThrow();
		});

		it("rejects non-integers, zero and negatives", () => {
			expect(() => validateConfig({ concurrency: 1.5 })).toThrow(/concurrency/);
			expect(() => validateConfig({ concurrency: 0 })).toThrow(/concurrency/);
			expect(() => validateConfig({ concurrency: -2 })).toThrow(/concurrency/);
		});
	});

	describe("testMatch", () => {
		it("accepts an array of strings", () => {
			expect(() => validateConfig({ testMatch: ["**/*.feature.ts"] })).not.toThrow();
		});

		it("rejects non-arrays and arrays with non-strings", () => {
			expect(() => validateConfig({ testMatch: "single" })).toThrow(/testMatch/);
			expect(() => validateConfig({ testMatch: ["x", 42] })).toThrow(/testMatch/);
		});
	});
});
