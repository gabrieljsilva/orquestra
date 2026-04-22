import { type ChildProcess, fork } from "node:child_process";
import { resolve } from "node:path";
import type { FeatureMeta, StepEvent } from "@orquestra/core";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./ipc-protocol";

export interface WorkerManagerOptions {
	configPath: string;
	featureFiles: string[];
	concurrency: number;
	stopOnFail: boolean;
	tsconfigPath?: string;
}

export interface WorkerManagerResult {
	events: StepEvent[];
	meta: FeatureMeta[];
	failedFiles: string[];
	pendingFiles: string[];
	crashed: boolean;
}

interface WorkerSlot {
	id: number;
	child: ChildProcess;
	currentFile: string | null;
	alive: boolean;
}

export class WorkerManager {
	private readonly options: WorkerManagerOptions;
	private readonly queue: string[];
	private readonly events: StepEvent[] = [];
	private readonly metaByName = new Map<string, FeatureMeta>();
	private readonly failedFiles = new Set<string>();
	private crashed = false;
	private workers: WorkerSlot[] = [];

	constructor(options: WorkerManagerOptions) {
		this.options = options;
		this.queue = [...options.featureFiles];
	}

	async run(): Promise<WorkerManagerResult> {
		const workerScript = this.resolveWorkerScript();
		const poolSize = Math.min(this.options.concurrency, this.options.featureFiles.length);

		for (let i = 0; i < poolSize; i++) {
			this.spawnWorker(i, workerScript);
		}

		await this.waitForCompletion();
		await this.shutdownAll();

		return {
			events: this.events,
			meta: Array.from(this.metaByName.values()),
			failedFiles: Array.from(this.failedFiles),
			pendingFiles: [...this.queue],
			crashed: this.crashed,
		};
	}

	private resolveWorkerScript(): string {
		return resolve(__dirname, "worker.cjs.js");
	}

	private spawnWorker(id: number, workerScript: string): void {
		const args = [this.options.configPath, String(id)];
		if (this.options.tsconfigPath) args.push(this.options.tsconfigPath);

		const child = fork(workerScript, args, {
			stdio: ["ignore", "inherit", "inherit", "ipc"],
			env: { ...process.env, ORQUESTRA_WORKER_ID: String(id) },
			execArgv: ["--no-deprecation"],
		});

		const slot: WorkerSlot = { id, child, currentFile: null, alive: true };
		this.workers.push(slot);

		child.on("message", (msg: WorkerToMainMessage) => {
			this.handleMessage(slot, msg);
		});

		child.on("exit", (code) => {
			slot.alive = false;
			if (code !== 0 && slot.currentFile) {
				this.failedFiles.add(slot.currentFile);
				this.crashed = true;
				console.error(`[orquestra] worker ${id} crashed (exit ${code}) during "${slot.currentFile}"`);

				if (this.options.stopOnFail) {
					this.killAll();
				}
			}
		});
	}

	private handleMessage(slot: WorkerSlot, msg: WorkerToMainMessage): void {
		switch (msg.type) {
			case "ready":
				this.assignNext(slot);
				break;

			case "step:event":
				this.events.push(msg.event);
				break;

			case "feature:meta":
				if (!this.metaByName.has(msg.meta.feature)) {
					this.metaByName.set(msg.meta.feature, msg.meta);
				}
				break;

			case "feature:done":
				slot.currentFile = null;
				break;

			case "feature:failed":
				this.failedFiles.add(msg.file);
				slot.currentFile = null;
				console.error(`[orquestra] worker ${slot.id} failed "${msg.file}": ${msg.error.message}`);
				if (this.options.stopOnFail) {
					this.killAll();
				}
				break;

			case "worker:done":
				slot.alive = false;
				break;
		}
	}

	private assignNext(slot: WorkerSlot): void {
		if (!slot.alive) return;
		const file = this.queue.shift();
		if (!file) {
			this.send(slot, { type: "shutdown" });
			return;
		}
		slot.currentFile = file;
		this.send(slot, { type: "feature:assign", file });
	}

	private send(slot: WorkerSlot, msg: MainToWorkerMessage): void {
		if (!slot.alive) return;
		try {
			slot.child.send(msg);
		} catch {
			slot.alive = false;
		}
	}

	private killAll(): void {
		for (const w of this.workers) {
			if (w.alive) {
				try {
					w.child.kill("SIGTERM");
				} catch {
					// ignore
				}
			}
		}
	}

	private async waitForCompletion(): Promise<void> {
		return new Promise((resolve) => {
			const check = () => {
				const allDone = this.workers.every((w) => !w.alive);
				if (allDone) {
					resolve();
					return;
				}
				setTimeout(check, 50);
			};
			check();
		});
	}

	private async shutdownAll(): Promise<void> {
		for (const w of this.workers) {
			if (w.alive) {
				this.send(w, { type: "shutdown" });
			}
		}
	}
}
