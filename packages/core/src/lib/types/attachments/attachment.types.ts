export type AttachmentType = "text" | "markdown" | "json" | "image" | "file";

export type AttachmentInput =
	| { name: string; type: "text" | "markdown"; data: string }
	| { name: string; type: "json"; data: unknown }
	| { name: string; type: "image" | "file"; data: Buffer | Uint8Array; mimeType?: string };

/**
 * Attachment as it travels in the StepEvent. Either inline (small text/json)
 * or already spilled to disk by the worker (binary or oversized text).
 */
export interface AttachmentEvent {
	name: string;
	type: AttachmentType;
	mimeType?: string;
	bytes: number;
	/** ISO 8601 — set when the user calls `attach()`. Lets viewers interleave
	 * attachments and logs in chronological order. */
	timestamp: string;
	inline?: string | unknown;
	path?: string;
}

export interface ArtifactAttachment {
	name: string;
	type: AttachmentType;
	mimeType?: string;
	bytes: number;
	timestamp: string;
	inline?: string | unknown;
	path?: string;
}

export interface ArtifactLog {
	label: string;
	value: unknown;
	timestamp: string;
}
