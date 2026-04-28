import { defineModule } from "@orquestra/core";
import { WorkerIsolation } from "./worker-isolation.service";

export const isolationModule = defineModule({
	services: [WorkerIsolation],
	beforeStartServer: (ctx) => ctx.get(WorkerIsolation).setup(),
});
