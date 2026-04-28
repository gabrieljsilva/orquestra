import { StepCollector } from "./step-collector";

describe("StepCollector", () => {
	it("starts empty and unfrozen", () => {
		const c = new StepCollector();
		expect(c.attachments).toEqual([]);
		expect(c.logs).toEqual([]);
		expect(c.frozen).toBe(false);
	});

	it("attaches text and computes bytes from utf8 length", () => {
		const c = new StepCollector();
		c.attach({ name: "answer", type: "text", data: "olá" });

		expect(c.attachments).toHaveLength(1);
		expect(c.attachments[0]).toMatchObject({
			name: "answer",
			type: "text",
			inline: "olá",
			bytes: Buffer.byteLength("olá", "utf8"),
		});
	});

	it("attaches markdown the same way as text", () => {
		const c = new StepCollector();
		c.attach({ name: "doc", type: "markdown", data: "# hi" });

		expect(c.attachments[0]).toMatchObject({
			name: "doc",
			type: "markdown",
			inline: "# hi",
			bytes: 4,
		});
	});

	it("attaches json by stringifying for byte count and keeping the original inline value", () => {
		const c = new StepCollector();
		const payload = { id: 1, name: "x" };
		c.attach({ name: "body", type: "json", data: payload });

		expect(c.attachments[0]).toMatchObject({
			name: "body",
			type: "json",
			inline: payload,
			bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
		});
	});

	it("normalizes image data to a Buffer and preserves mimeType", () => {
		const c = new StepCollector();
		const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		c.attach({ name: "shot", type: "image", data: buf, mimeType: "image/png" });

		const att = c.attachments[0];
		expect(Buffer.isBuffer(att.inline)).toBe(true);
		expect(att.bytes).toBe(buf.byteLength);
		expect(att.mimeType).toBe("image/png");
	});

	it("converts Uint8Array image data to Buffer", () => {
		const c = new StepCollector();
		const u8 = new Uint8Array([1, 2, 3, 4, 5]);
		c.attach({ name: "x", type: "image", data: u8 });

		const att = c.attachments[0];
		expect(Buffer.isBuffer(att.inline)).toBe(true);
		expect(att.bytes).toBe(5);
	});

	it("records logs with an ISO timestamp", () => {
		const c = new StepCollector();
		c.log("model", "gpt-4");
		c.log("cost", { input: 100, output: 50 });

		expect(c.logs).toHaveLength(2);
		expect(c.logs[0].label).toBe("model");
		expect(c.logs[0].value).toBe("gpt-4");
		// ISO 8601 with milliseconds and trailing Z
		expect(c.logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		expect(c.logs[1].value).toEqual({ input: 100, output: 50 });
	});

	it("freeze flips the frozen flag (consumers enforce write rejection)", () => {
		const c = new StepCollector();
		c.freeze();
		expect(c.frozen).toBe(true);
	});

	it("attachments and logs accumulate in insertion order", () => {
		const c = new StepCollector();
		c.attach({ name: "a", type: "text", data: "1" });
		c.attach({ name: "b", type: "text", data: "2" });
		c.log("first", 1);
		c.log("second", 2);

		expect(c.attachments.map((a) => a.name)).toEqual(["a", "b"]);
		expect(c.logs.map((l) => l.label)).toEqual(["first", "second"]);
	});

	it("stamps each attachment with an ISO timestamp at attach time", () => {
		const c = new StepCollector();
		c.attach({ name: "a", type: "text", data: "1" });
		c.attach({ name: "b", type: "json", data: { x: 1 } });
		c.attach({ name: "c", type: "image", data: Buffer.from([0]), mimeType: "image/png" });

		const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
		for (const att of c.attachments) {
			expect(att.timestamp).toMatch(isoRegex);
		}
	});

	it("attachment timestamps are non-decreasing across consecutive calls", async () => {
		const c = new StepCollector();
		c.attach({ name: "a", type: "text", data: "1" });
		await new Promise((r) => setTimeout(r, 5));
		c.attach({ name: "b", type: "text", data: "2" });

		const t0 = Date.parse(c.attachments[0].timestamp);
		const t1 = Date.parse(c.attachments[1].timestamp);
		expect(t1).toBeGreaterThanOrEqual(t0);
	});
});
