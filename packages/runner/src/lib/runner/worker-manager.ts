import { type ChildProcess, fork } from "node:child_process";
import { resolve } from "node:path";
import type { FeatureMeta, FeatureTimings, HookEvent, StepEvent } from "@orquestra/core";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./ipc-protocol";

export interface WorkerManagerOptions {
	configPath: string;
	featureFiles: string[];
	concurrency: number;
	stopOnFail: boolean;
	tsconfigPath?: string;
	/**
	 * Maximum time (ms) a single feature file can run inside a worker before
	 * the manager considers it stuck and kills the worker. Resolves the
	 * "manager hangs forever on a deadlocked Promise" failure mode.
	 * 0 / undefined disables the timeout.
	 */
	featureTimeoutMs?: number;
	/**
	 * Soft memory cap (MB) per worker. When a worker reports `heapUsedBytes`
	 * above this after finishing a feature, the manager tells it to drain and
	 * respawns a fresh worker to keep processing the queue. Undefined or 0
	 * disables recycling (no overhead in that case).
	 */
	workerMemoryLimitMb?: number;
}

export interface WorkerManagerResult {
	events: StepEvent[];
	hookEvents: HookEvent[];
	meta: FeatureMeta[];
	failedFiles: string[];
	pendingFiles: string[];
	crashed: boolean;
	featureDurationsMs: Record<string, number>;
	featureTimings: Record<string, FeatureTimings>;
	featureFilesByName: Record<string, string>;
	workerCount: number;
	/** Timestamp (ms epoch) of the first step:event received, or null if none. */
	firstStepAt: number | null;
	/** Timestamp (ms epoch) of the last step:event received, or null if none. */
	lastStepAt: number | null;
}

interface WorkerSlot {
	id: number;
	child: ChildProcess;
	currentFile: string | null;
	alive: boolean;
	featureTimer: NodeJS.Timeout | null;
	featureStartedAt: number | null;
	/** When true, a graceful shutdown was sent — the next exit must respawn. */
	recyclePending: boolean;
}

export class WorkerManager {
	private readonly options: WorkerManagerOptions;
	private readonly queue: string[];
	private readonly events: StepEvent[] = [];
	private readonly hookEvents: HookEvent[] = [];
	private readonly metaByName = new Map<string, FeatureMeta>();
	private readonly failedFiles = new Set<string>();
	private crashed = false;
	private workers: WorkerSlot[] = [];
	private shuttingDown = false;
	private readonly forcedKillTimeoutMs = 10_000;
	private completionPromise: Promise<void> | null = null;
	private completionResolve: (() => void) | null = null;
	private aliveCount = 0;
	private nextWorkerId = 0;
	private workerScript: string | null = null;
	private featureDurationsMs: Record<string, number> = {};
	private featureTimings: Record<string, FeatureTimings> = {};
	private featureFilesByName: Record<string, string> = {};
	private firstStepAt: number | null = null;
	private lastStepAt: number | null = null;

	constructor(options: WorkerManagerOptions) {
		this.options = options;
		this.queue = [...options.featureFiles];
	}

	/**
	 * Requests every worker to drain and shut down, then resolves once all
	 * workers have exited (or after `forcedKillTimeoutMs` SIGKILL'ing the
	 * stragglers). Used by the parent on SIGINT/SIGTERM so that teardown
	 * (close http server, stop services) gets a chance to run.
	 */
	async requestShutdown(): Promise<void> {
		if (this.shuttingDown) return;
		this.shuttingDown = true;
		this.queue.length = 0;

		for (const w of this.workers) {
			if (!w.alive) continue;
			this.send(w, { type: "shutdown" });
		}

		await new Promise<void>((resolve) => {
			const startedAt = Date.now();
			const check = () => {
				if (this.workers.every((w) => !w.alive)) return resolve();
				if (Date.now() - startedAt > this.forcedKillTimeoutMs) {
					for (const w of this.workers) {
						if (w.alive) {
							try {
								w.child.kill("SIGKILL");
							} catch {
								// ignore
							}
						}
					}
					return resolve();
				}
				setTimeout(check, 100);
			};
			check();
		});
	}

	async run(): Promise<WorkerManagerResult> {
		this.workerScript = this.resolveWorkerScript();
		const poolSize = Math.min(this.options.concurrency, this.options.featureFiles.length);

		this.completionPromise = new Promise<void>((resolve) => {
			this.completionResolve = resolve;
		});

		if (poolSize === 0) {
			this.completionResolve?.();
		} else {
			for (let i = 0; i < poolSize; i++) {
				this.spawnWorker(this.nextWorkerId++, this.workerScript);
			}
		}

		await this.completionPromise;

		return {
			events: this.events,
			hookEvents: this.hookEvents,
			meta: Array.from(this.metaByName.values()),
			failedFiles: Array.from(this.failedFiles),
			pendingFiles: [...this.queue],
			crashed: this.crashed,
			featureDurationsMs: { ...this.featureDurationsMs },
			featureTimings: { ...this.featureTimings },
			featureFilesByName: { ...this.featureFilesByName },
			workerCount: this.workers.length,
			firstStepAt: this.firstStepAt,
			lastStepAt: this.lastStepAt,
		};
	}

	private recordFeatureDuration(slot: WorkerSlot): void {
		if (slot.currentFile && slot.featureStartedAt !== null) {
			this.featureDurationsMs[slot.currentFile] = Date.now() - slot.featureStartedAt;
		}
		slot.featureStartedAt = null;
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

		const slot: WorkerSlot = {
			id,
			child,
			currentFile: null,
			alive: true,
			featureTimer: null,
			featureStartedAt: null,
			recyclePending: false,
		};
		this.workers.push(slot);
		this.aliveCount += 1;

		child.on("message", (msg: WorkerToMainMessage) => {
			this.handleMessage(slot, msg);
		});

		child.on("exit", (code) => {
			slot.alive = false;
			this.clearFeatureTimer(slot);
			const wasRecycling = slot.recyclePending;
			if (!wasRecycling && code !== 0 && slot.currentFile) {
				this.failedFiles.add(slot.currentFile);
				this.recordFeatureDuration(slot);
				this.crashed = true;
				console.error(`[orquestra] worker ${id} crashed (exit ${code}) during "${slot.currentFile}"`);

				if (this.options.stopOnFail) {
					void this.requestShutdown();
				}
			}
			this.aliveCount -= 1;

			// A graceful recycle exits cleanly — replace the slot with a fresh
			// worker so the queue keeps draining at the same parallelism.
			if (wasRecycling && !this.shuttingDown && this.queue.length > 0 && this.workerScript) {
				this.spawnWorker(this.nextWorkerId++, this.workerScript);
				return;
			}

			if (this.aliveCount <= 0 && this.completionResolve) {
				this.completionResolve();
				this.completionResolve = null;
			}
		});
	}

	private clearFeatureTimer(slot: WorkerSlot): void {
		if (slot.featureTimer) {
			clearTimeout(slot.featureTimer);
			slot.featureTimer = null;
		}
	}

	private armFeatureTimer(slot: WorkerSlot, file: string): void {
		this.clearFeatureTimer(slot);
		const timeout = this.options.featureTimeoutMs;
		if (!timeout || timeout <= 0) return;
		slot.featureTimer = setTimeout(() => {
			if (!slot.alive || slot.currentFile !== file) return;
			console.error(`[orquestra] worker ${slot.id} exceeded ${timeout}ms on "${file}" — killing`);
			this.failedFiles.add(file);
			this.crashed = true;
			try {
				slot.child.kill("SIGKILL");
			} catch {
				// ignore — exit handler still runs
			}
		}, timeout);
	}

	private handleMessage(slot: WorkerSlot, msg: WorkerToMainMessage): void {
		switch (msg.type) {
			case "ready":
				this.assignNext(slot);
				break;

			case "step:event": {
				const now = Date.now();
				if (this.firstStepAt === null) this.firstStepAt = now;
				this.lastStepAt = now;
				this.events.push(msg.event);
				break;
			}

			case "hook:event":
				this.hookEvents.push(msg.event);
				break;

			case "feature:meta":
				if (!this.metaByName.has(msg.meta.feature)) {
					this.metaByName.set(msg.meta.feature, msg.meta);
				}
				this.featureFilesByName[msg.meta.feature] = msg.file;
				break;

			case "feature:done":
				this.recordFeatureDuration(slot);
				this.featureTimings[msg.file] = msg.timings;
				slot.currentFile = null;
				this.clearFeatureTimer(slot);
				this.maybeRecycleForMemory(slot, msg.heapUsedBytes);
				break;

			case "feature:failed":
				this.failedFiles.add(msg.file);
				this.recordFeatureDuration(slot);
				if (msg.timings) this.featureTimings[msg.file] = msg.timings;
				slot.currentFile = null;
				this.clearFeatureTimer(slot);
				console.error(`[orquestra] worker ${slot.id} failed "${msg.file}": ${msg.error.message}`);
				if (this.options.stopOnFail) {
					void this.requestShutdown();
				} else {
					this.maybeRecycleForMemory(slot, msg.heapUsedBytes);
				}
				break;

			case "worker:done":
				slot.alive = false;
				break;
		}
	}

	private assignNext(slot: WorkerSlot): void {
		if (!slot.alive || slot.recyclePending) return;
		const file = this.queue.shift();
		if (!file) {
			this.send(slot, { type: "shutdown" });
			return;
		}
		slot.currentFile = file;
		slot.featureStartedAt = Date.now();
		this.armFeatureTimer(slot, file);
		this.send(slot, { type: "feature:assign", file });
	}

	private maybeRecycleForMemory(slot: WorkerSlot, heapUsedBytes: number | undefined): void {
		const limitMb = this.options.workerMemoryLimitMb;
		if (!limitMb || limitMb <= 0) return;
		if (heapUsedBytes === undefined) return;
		if (this.shuttingDown || slot.recyclePending) return;
		if (this.queue.length === 0) return;

		const heapMb = heapUsedBytes / (1024 * 1024);
		if (heapMb < limitMb) return;

		slot.recyclePending = true;
		console.log(`[orquestra] worker ${slot.id} recycling — heap ${heapMb.toFixed(0)}MB ≥ limit ${limitMb}MB`);
		this.send(slot, { type: "shutdown" });
	}

	private send(slot: WorkerSlot, msg: MainToWorkerMessage): void {
		if (!slot.alive) return;
		try {
			slot.child.send(msg);
		} catch {
			slot.alive = false;
		}
	}
}
