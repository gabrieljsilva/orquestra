import { test } from "node:test";
import type { Feature, Orquestra } from "@orquestra/core";
import { initOrquestra, resetOrquestraInstance } from "@orquestra/core";
import { createJiti } from "jiti";
import { loadConfig } from "./lib/loaders/config.loader";
import { configToWorkerOptions } from "./lib/runner/config-mapper";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./lib/runner/ipc-protocol";

const jiti = createJiti(import.meta.url, { interopDefault: true });

function send(msg: WorkerToMainMessage): void {
	if (process.send) process.send(msg);
}

async function main() {
	const configPath = process.argv[2];
	const workerId = process.argv[3];

	if (!configPath || workerId === undefined) {
		console.error("[worker] missing args: configPath and workerId required");
		process.exit(1);
	}

	process.env.ORQUESTRA_WORKER_ID = workerId;

	const { config } = await loadConfig(configPath);
	resetOrquestraInstance();
	const orq = initOrquestra({ ...configToWorkerOptions(config) });

	await orq.start({ skipContainers: true });

	const processedFeatureNames = new Set<string>();
	const emittedMetaNames = new Set<string>();

	const processFeature = async (file: string) => {
		try {
			const before = new Set(orq.getBddContainer().getFeatures().map((f) => f.getName()));
			await jiti.import(file);
			const features = orq.getBddContainer().getFeatures();
			const newFeatures = features.filter((f) => !before.has(f.getName()));

			for (const feature of newFeatures) {
				await executeFeature(orq, feature);
			}

			for (const meta of orq.getFeatureMeta()) {
				if (!emittedMetaNames.has(meta.feature) && !processedFeatureNames.has(meta.feature)) {
					send({ type: "feature:meta", meta });
					emittedMetaNames.add(meta.feature);
				}
			}

			for (const feature of newFeatures) {
				processedFeatureNames.add(feature.getName());
			}

			send({ type: "feature:done", file });
		} catch (err) {
			const error = err as Error;
			send({
				type: "feature:failed",
				file,
				error: { message: error.message, stack: error.stack },
			});
		}
	};

	process.on("message", async (msg: MainToWorkerMessage) => {
		if (msg.type === "feature:assign") {
			await processFeature(msg.file);
			send({ type: "ready" });
		} else if (msg.type === "shutdown") {
			try {
				await orq.teardown();
			} finally {
				send({ type: "worker:done" });
				process.exit(0);
			}
		}
	});

	send({ type: "ready" });
}

async function executeFeature(orq: Orquestra, feature: Feature): Promise<void> {
	const knownEventCounts = new Map<string, number>();

	for (const scenario of feature.getScenarios()) {
		const name = `${feature.getName()} > ${scenario.name}`;
		await test(name, async () => {
			await feature.withRegistry(() => scenario.runAllSteps());
		});

		const events = feature.getEvents();
		const prevCount = knownEventCounts.get(feature.getName()) ?? 0;
		for (let i = prevCount; i < events.length; i++) {
			send({ type: "step:event", event: events[i] });
		}
		knownEventCounts.set(feature.getName(), events.length);
	}
}

main().catch((err) => {
	console.error("[worker] fatal:", err);
	process.exit(1);
});
