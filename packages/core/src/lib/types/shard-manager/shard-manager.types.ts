export type StepStatus = "pending" | "success" | "failed";

export interface StepEvent {
	runId: string;
	workerPid: number;
	testFile?: string;

	feature: string;
	scenario: string;
	stepId: string;
	stepName: string;
	keyword: "Given" | "When" | "Then";

	ts: string;
	tCollect?: string;
	tStart?: string;
	tEnd?: string;
	status: StepStatus;
	error?: { message: string; stack?: string };
}
