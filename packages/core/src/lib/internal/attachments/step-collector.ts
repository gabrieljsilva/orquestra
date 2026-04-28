import type { ArtifactLog, AttachmentEvent, AttachmentInput } from "../../types/attachments";

/**
 * Per-step buffer of attachments and logs. Created at the start of each step/hook
 * and frozen when the callback returns. Frozen collectors throw on further
 * `attach`/`log` to surface fire-and-forget bugs (a promise that was not awaited
 * inside the step and resolves later).
 */
export class StepCollector {
	private readonly _attachments: AttachmentEvent[] = [];
	private readonly _logs: ArtifactLog[] = [];
	private _frozen = false;

	get frozen(): boolean {
		return this._frozen;
	}

	get attachments(): ReadonlyArray<AttachmentEvent> {
		return this._attachments;
	}

	get logs(): ReadonlyArray<ArtifactLog> {
		return this._logs;
	}

	freeze(): void {
		this._frozen = true;
	}

	attach(input: AttachmentInput): void {
		const event = toAttachmentEvent(input);
		this._attachments.push(event);
	}

	log(label: string, value: unknown): void {
		this._logs.push({ label, value, timestamp: new Date().toISOString() });
	}
}

function toAttachmentEvent(input: AttachmentInput): AttachmentEvent {
	const timestamp = new Date().toISOString();

	if (input.type === "image" || input.type === "file") {
		const buf = toBuffer(input.data);
		return {
			name: input.name,
			type: input.type,
			mimeType: input.mimeType,
			bytes: buf.byteLength,
			timestamp,
			inline: buf,
		};
	}

	if (input.type === "json") {
		const json = JSON.stringify(input.data);
		return {
			name: input.name,
			type: "json",
			bytes: Buffer.byteLength(json, "utf8"),
			timestamp,
			inline: input.data,
		};
	}

	const text = input.data;
	return {
		name: input.name,
		type: input.type,
		bytes: Buffer.byteLength(text, "utf8"),
		timestamp,
		inline: text,
	};
}

function toBuffer(data: Buffer | Uint8Array): Buffer {
	return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
