import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AttachmentEvent, StepEvent } from "@orquestra/core";
import { afterEach, beforeEach } from "vitest";
import { spilloverStepEvent } from "./spillover";

let outputDir: string;

beforeEach(() => {
	outputDir = mkdtempSync(join(tmpdir(), "orq-spillover-"));
});

afterEach(() => {
	rmSync(outputDir, { recursive: true, force: true });
});

const FIXED_TIMESTAMP = "2026-04-28T17:30:00.000Z";

type AttachmentInput = Omit<AttachmentEvent, "timestamp"> & { timestamp?: string };

function makeEvent(attachments: AttachmentInput[]): StepEvent {
	return {
		feature: "f",
		scenario: "s",
		stepId: "step-1",
		stepName: "step",
		keyword: "When",
		status: "success",
		attachments: attachments.map((a) => ({ ...a, timestamp: a.timestamp ?? FIXED_TIMESTAMP })),
	};
}

describe("spilloverStepEvent", () => {
	it("returns the same event reference when there are no attachments", () => {
		const evt: StepEvent = {
			feature: "f",
			scenario: "s",
			stepId: "x",
			stepName: "x",
			keyword: "Given",
			status: "success",
		};
		expect(spilloverStepEvent(evt, "scenario-id", { outputDir })).toBe(evt);
	});

	it("returns the same event reference when the attachments array is empty", () => {
		const evt = makeEvent([]);
		expect(spilloverStepEvent(evt, "scenario-id", { outputDir })).toBe(evt);
	});

	it("keeps small text/json/markdown attachments inline", () => {
		const evt = makeEvent([
			{ name: "t", type: "text", inline: "small", bytes: 5 },
			{ name: "j", type: "json", inline: { ok: true }, bytes: 10 },
			{ name: "m", type: "markdown", inline: "# hi", bytes: 4 },
		]);

		const result = spilloverStepEvent(evt, "scenario-id", { outputDir });

		expect(result.attachments?.[0].inline).toBe("small");
		expect(result.attachments?.[0].path).toBeUndefined();
		expect(result.attachments?.[1].inline).toEqual({ ok: true });
		expect(result.attachments?.[1].path).toBeUndefined();
		expect(result.attachments?.[2].inline).toBe("# hi");
		expect(result.attachments?.[2].path).toBeUndefined();
	});

	it("spills text/markdown/json above the threshold to disk and drops inline", () => {
		const big = "x".repeat(200);
		const bigJson = { data: "y".repeat(200) };
		const evt = makeEvent([
			{ name: "huge text", type: "text", inline: big, bytes: 200 },
			{ name: "huge json", type: "json", inline: bigJson, bytes: 250 },
			{ name: "huge md", type: "markdown", inline: big, bytes: 200 },
		]);

		const result = spilloverStepEvent(evt, "scn", { outputDir, inlineThresholdBytes: 100 });

		for (const att of result.attachments ?? []) {
			expect(att.inline).toBeUndefined();
			expect(att.path).toBeTruthy();
		}

		const textPath = join(outputDir, result.attachments![0].path!);
		expect(readFileSync(textPath, "utf8")).toBe(big);

		const jsonPath = join(outputDir, result.attachments![1].path!);
		expect(JSON.parse(readFileSync(jsonPath, "utf8"))).toEqual(bigJson);
	});

	it("always spills binary attachments regardless of size", () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const evt = makeEvent([{ name: "tiny shot", type: "image", inline: png, bytes: png.byteLength, mimeType: "image/png" }]);

		const result = spilloverStepEvent(evt, "scn", { outputDir });

		expect(result.attachments?.[0].inline).toBeUndefined();
		expect(result.attachments?.[0].path).toMatch(/^attachments\/scn\/0-tiny_shot\.png$/);
		expect(result.attachments?.[0].mimeType).toBe("image/png");

		const onDisk = readFileSync(join(outputDir, result.attachments![0].path!));
		expect(onDisk.equals(png)).toBe(true);
	});

	it("uses the index in the filename to disambiguate same-named attachments", () => {
		const data = "a".repeat(200);
		const evt = makeEvent([
			{ name: "snapshot", type: "text", inline: data, bytes: 200 },
			{ name: "snapshot", type: "text", inline: data, bytes: 200 },
		]);

		const result = spilloverStepEvent(evt, "scn", { outputDir, inlineThresholdBytes: 100 });

		expect(result.attachments?.[0].path).toMatch(/0-snapshot\.txt$/);
		expect(result.attachments?.[1].path).toMatch(/1-snapshot\.txt$/);
	});

	it("sanitizes filesystem-unsafe characters in the attachment name", () => {
		const evt = makeEvent([
			{ name: "../etc/passwd", type: "image", inline: Buffer.from([0]), bytes: 1, mimeType: "image/png" },
		]);

		const result = spilloverStepEvent(evt, "scn", { outputDir });

		// `../` cannot escape the attachments directory — only word/dash/underscore survive.
		expect(result.attachments?.[0].path).not.toContain("..");
		expect(result.attachments?.[0].path).toMatch(/0-_+etc_passwd\.png$/);
	});

	it("falls back to a default name when the sanitized name is empty", () => {
		const evt = makeEvent([{ name: "", type: "image", inline: Buffer.from([0]), bytes: 1, mimeType: "image/png" }]);
		const result = spilloverStepEvent(evt, "scn", { outputDir });

		expect(result.attachments?.[0].path).toMatch(/0-attachment\.png$/);
	});

	it("replaces unsafe characters with underscores rather than dropping them", () => {
		const evt = makeEvent([{ name: "!!!", type: "image", inline: Buffer.from([0]), bytes: 1, mimeType: "image/png" }]);
		const result = spilloverStepEvent(evt, "scn", { outputDir });

		expect(result.attachments?.[0].path).toMatch(/0-___\.png$/);
	});

	it("derives image extensions from mimeType when known", () => {
		const cases: Array<[string, string]> = [
			["image/png", "png"],
			["image/jpeg", "jpg"],
			["image/gif", "gif"],
			["image/webp", "webp"],
			["image/svg+xml", "svg"],
		];

		for (const [mime, ext] of cases) {
			const evt = makeEvent([{ name: "img", type: "image", inline: Buffer.from([0]), bytes: 1, mimeType: mime }]);
			const result = spilloverStepEvent(evt, `scn-${ext}`, { outputDir });
			expect(result.attachments?.[0].path?.endsWith(`.${ext}`)).toBe(true);
		}
	});

	it("uses .png as fallback for image without a known mimeType", () => {
		const evt = makeEvent([{ name: "img", type: "image", inline: Buffer.from([0]), bytes: 1 }]);
		const result = spilloverStepEvent(evt, "scn", { outputDir });

		expect(result.attachments?.[0].path?.endsWith(".png")).toBe(true);
	});

	it("uses .bin as fallback for unknown file mimeType", () => {
		const evt = makeEvent([{ name: "data", type: "file", inline: Buffer.from([1, 2]), bytes: 2 }]);
		const result = spilloverStepEvent(evt, "scn", { outputDir });

		expect(result.attachments?.[0].path?.endsWith(".bin")).toBe(true);
	});

	it("converts Uint8Array to Buffer for spill writes", () => {
		const u8 = new Uint8Array([10, 20, 30]);
		const evt = makeEvent([{ name: "x", type: "file", inline: u8, bytes: 3 }]);
		const result = spilloverStepEvent(evt, "scn", { outputDir });

		const onDisk = readFileSync(join(outputDir, result.attachments![0].path!));
		expect([...onDisk]).toEqual([10, 20, 30]);
	});

	it("throws a descriptive error when binary attachment inline is missing or wrong type", () => {
		const evt = makeEvent([{ name: "x", type: "image", inline: "not a buffer" as any, bytes: 5 }]);

		expect(() => spilloverStepEvent(evt, "scn", { outputDir })).toThrow(/is type=image but inline is not a Buffer/);
	});

	it("preserves bytes from the source event (the original size, not the on-disk size)", () => {
		const big = "x".repeat(200);
		const evt = makeEvent([{ name: "n", type: "text", inline: big, bytes: 200 }]);

		const result = spilloverStepEvent(evt, "scn", { outputDir, inlineThresholdBytes: 100 });

		expect(result.attachments?.[0].bytes).toBe(200);
	});

	it("preserves the timestamp through spillover (used to interleave with logs)", () => {
		const ts = "2026-04-28T17:31:42.123Z";
		const evt = makeEvent([
			{ name: "small", type: "text", inline: "tiny", bytes: 4, timestamp: ts },
			{ name: "huge", type: "text", inline: "y".repeat(200), bytes: 200, timestamp: ts },
		]);

		const result = spilloverStepEvent(evt, "scn", { outputDir, inlineThresholdBytes: 100 });

		expect(result.attachments?.[0].timestamp).toBe(ts);
		expect(result.attachments?.[1].timestamp).toBe(ts);
	});

	it("uses 50KB as the default inline threshold", () => {
		const fortyKb = "x".repeat(40_000);
		const sixtyKb = "y".repeat(60_000);
		const evt = makeEvent([
			{ name: "small", type: "text", inline: fortyKb, bytes: 40_000 },
			{ name: "big", type: "text", inline: sixtyKb, bytes: 60_000 },
		]);

		const result = spilloverStepEvent(evt, "scn", { outputDir });

		expect(result.attachments?.[0].inline).toBe(fortyKb);
		expect(result.attachments?.[0].path).toBeUndefined();
		expect(result.attachments?.[1].inline).toBeUndefined();
		expect(result.attachments?.[1].path).toBeTruthy();
	});
});
