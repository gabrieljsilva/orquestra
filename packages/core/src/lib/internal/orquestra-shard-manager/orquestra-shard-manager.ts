import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ORQUESTRA_RUN_ID_ENV } from "../../constants/shard-manager";
import type { StepEvent, StepStatus } from "../../types/shard-manager/shard-manager.types";

export class OrquestraShardManager {
	private readonly runId: string;

	constructor(runId?: string) {
		this.runId = runId || OrquestraShardManager.ensureRunId();
	}

	static ensureRunId(): string {
		let id = process.env[ORQUESTRA_RUN_ID_ENV];
		if (!id) {
			id = randomUUID();
			process.env[ORQUESTRA_RUN_ID_ENV] = id;
		}
		return id;
	}

	getRunId(): string {
		return this.runId;
	}

	getRootDir(): string {
		return join(process.cwd(), ".orquestra", this.runId);
	}

	private ensureDir(): string {
		const dir = this.getRootDir();
		mkdirSync(dir, { recursive: true });
		return dir;
	}

	write(event: StepEvent): void {
		const dir = this.ensureDir();
		const now = process.hrtime.bigint().toString();
		const rand = Math.random().toString(36).slice(2, 8);
		const file = `${now}-${process.pid}-${rand}.json`;
		const path = join(dir, file);
		writeFileSync(path, JSON.stringify(event));
	}

	readEvents(): StepEvent[] {
		const root = this.getRootDir();
		let files: string[] = [];
		try {
			files = readdirSync(root).filter((f) => f.endsWith(".json"));
		} catch {
			return [];
		}
		files.sort();

		const events: StepEvent[] = [];
		for (const f of files) {
			try {
				const raw = readFileSync(join(root, f), "utf8");
				events.push(JSON.parse(raw) as StepEvent);
			} catch {
				// ignore parse/read errors for robustness
			}
		}
		return events;
	}
}
