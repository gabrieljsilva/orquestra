import type { ArtifactLog, AttachmentEvent } from "../attachments";
import type { HookKind } from "../lifecycle/hook.types";

export type StepStatus = "pending" | "success" | "failed";

export interface StepEvent {
	feature: string;
	scenario: string;
	stepId: string;
	stepName: string;
	keyword: "Given" | "When" | "Then";
	status: StepStatus;
	durationMs?: number;
	error?: { message: string; stack?: string };
	attachments?: AttachmentEvent[];
	logs?: ArtifactLog[];
}

/**
 * Emitted only when a hook FAILS. Hooks are otherwise silent.
 * `feature`/`scenario` are populated for `beforeEach`/`afterEach` failures;
 * file-scoped hooks (`beforeStartServer`, `afterStartServer`, `beforeStopServer`)
 * carry the file path in `file` instead.
 */
export interface HookEvent {
	hookName: HookKind;
	file?: string;
	feature?: string;
	scenario?: string;
	error: { message: string; stack?: string };
	durationMs?: number;
}
