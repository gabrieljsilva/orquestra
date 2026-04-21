import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ORQUESTRA_RUN_ID_ENV } from "../../constants/shard-manager";
import type { FeatureMeta, RunManifest } from "../../types/reporting";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";

const MANIFEST_FILE = "manifest.json";
const META_FILE = "meta.json";
const EVENT_FILE_REGEX = /^\d+-\d+-[a-z0-9]+\.json$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

	private getOrquestraDir(): string {
		return join(process.cwd(), ".orquestra");
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

	writeManifest(manifest: RunManifest): void {
		const dir = this.ensureDir();
		writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
	}

	readManifest(): RunManifest | null {
		try {
			const raw = readFileSync(join(this.getRootDir(), MANIFEST_FILE), "utf8");
			return JSON.parse(raw) as RunManifest;
		} catch {
			return null;
		}
	}

	writeMeta(meta: FeatureMeta[]): void {
		const dir = this.ensureDir();
		writeFileSync(join(dir, META_FILE), JSON.stringify(meta, null, 2));
	}

	readMeta(): FeatureMeta[] {
		try {
			const raw = readFileSync(join(this.getRootDir(), META_FILE), "utf8");
			return JSON.parse(raw) as FeatureMeta[];
		} catch {
			return [];
		}
	}

	readEvents(): StepEvent[] {
		const root = this.getRootDir();
		let files: string[] = [];
		try {
			files = readdirSync(root).filter((f) => EVENT_FILE_REGEX.test(f));
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

	listRuns(): Array<{ runId: string; mtime: number }> {
		const root = this.getOrquestraDir();
		let entries: string[] = [];
		try {
			entries = readdirSync(root);
		} catch {
			return [];
		}

		const runs: Array<{ runId: string; mtime: number }> = [];
		for (const entry of entries) {
			if (!UUID_REGEX.test(entry)) continue;
			try {
				const stats = statSync(join(root, entry));
				if (!stats.isDirectory()) continue;
				runs.push({ runId: entry, mtime: stats.mtimeMs });
			} catch {
				// ignore
			}
		}
		return runs;
	}

	cleanupOldRuns(limit: number): void {
		if (limit < 1) return;
		const runs = this.listRuns();
		const others = runs.filter((r) => r.runId !== this.runId).sort((a, b) => b.mtime - a.mtime);
		const toKeep = Math.max(0, limit - 1);
		const toDelete = others.slice(toKeep);
		for (const run of toDelete) {
			try {
				rmSync(join(this.getOrquestraDir(), run.runId), { recursive: true, force: true });
			} catch {
				// ignore erros de filesystem; nao sao criticos
			}
		}
	}
}
