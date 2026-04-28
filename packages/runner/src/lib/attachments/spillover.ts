import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AttachmentEvent, StepEvent } from "@orquestra/core";

export const DEFAULT_INLINE_THRESHOLD_BYTES = 50_000;

const MIME_TO_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"application/pdf": "pdf",
};

export interface SpilloverOptions {
	outputDir: string;
	inlineThresholdBytes?: number;
}

/**
 * Walks the step event's attachments. Anything binary (image/file) or
 * larger than the inline threshold is written to disk under
 * `outputDir/attachments/<scenarioId>/<n>-<safeName>.<ext>`; the inline
 * payload is then dropped from the event in favor of a relative path.
 */
export function spilloverStepEvent(event: StepEvent, scenarioId: string, opts: SpilloverOptions): StepEvent {
	if (!event.attachments || event.attachments.length === 0) return event;

	const threshold = opts.inlineThresholdBytes ?? DEFAULT_INLINE_THRESHOLD_BYTES;
	const next = event.attachments.map((att, index) =>
		processAttachment(att, index, scenarioId, opts.outputDir, threshold),
	);

	return { ...event, attachments: next };
}

function processAttachment(
	att: AttachmentEvent,
	index: number,
	scenarioId: string,
	outputDir: string,
	threshold: number,
): AttachmentEvent {
	const isBinary = att.type === "image" || att.type === "file";
	const isOversized = att.bytes > threshold;

	if (!isBinary && !isOversized) return att;

	const dir = join(resolve(outputDir), "attachments", scenarioId);
	mkdirSync(dir, { recursive: true });

	const ext = extensionFor(att);
	const safeName = sanitizeForFilesystem(att.name);
	const filename = `${index}-${safeName}.${ext}`;
	const absolutePath = join(dir, filename);
	const relativePath = join("attachments", scenarioId, filename);

	writeFileSync(absolutePath, serializeAttachmentData(att));

	return {
		name: att.name,
		type: att.type,
		mimeType: att.mimeType,
		bytes: att.bytes,
		timestamp: att.timestamp,
		path: relativePath,
	};
}

function serializeAttachmentData(att: AttachmentEvent): Buffer | string {
	if (att.type === "image" || att.type === "file") {
		const data = att.inline;
		if (Buffer.isBuffer(data)) return data;
		if (data instanceof Uint8Array) return Buffer.from(data);
		throw new Error(`attachment "${att.name}" is type=${att.type} but inline is not a Buffer/Uint8Array`);
	}
	if (att.type === "json") {
		return JSON.stringify(att.inline, null, 2);
	}
	return String(att.inline ?? "");
}

function extensionFor(att: AttachmentEvent): string {
	if (att.type === "json") return "json";
	if (att.type === "markdown") return "md";
	if (att.type === "text") return "txt";
	if (att.mimeType && MIME_TO_EXT[att.mimeType]) return MIME_TO_EXT[att.mimeType];
	if (att.type === "image") return "png";
	return "bin";
}

function sanitizeForFilesystem(name: string): string {
	const cleaned = name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 50);
	return cleaned.length > 0 ? cleaned : "attachment";
}
