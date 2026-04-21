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
}
