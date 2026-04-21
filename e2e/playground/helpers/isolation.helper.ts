import { EnvHelper, type OnStart, OrquestraHelper } from "@orquestra/core";
import { Client } from "pg";

export class WorkerIsolationHelper extends OrquestraHelper implements OnStart {
	async onStart() {
		const env = this.ctx.container.get(EnvHelper);
		const workerId = process.env.ORQUESTRA_WORKER_ID ?? "0";

		const baseUrl = env.get("DATABASE_BASE_URL");
		if (baseUrl) {
			const schema = `test_worker_${workerId}`;
			const admin = new Client(baseUrl);
			await admin.connect();
			try {
				await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
			} finally {
				await admin.end();
			}

			const separator = baseUrl.includes("?") ? "&" : "?";
			const isolatedUrl = `${baseUrl}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
			env.override("DATABASE_URL", isolatedUrl);
			env.override("DATABASE_SCHEMA", schema);
		}

		if (env.get("RABBITMQ_URL")) {
			env.override("USERS_EXCHANGE", `users_worker_${workerId}`);
			env.override("USERS_QUEUE", `users_worker_${workerId}.created`);
		}
	}
}
