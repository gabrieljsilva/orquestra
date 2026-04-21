import { resolve } from "node:path";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { OrquestraConsoleReporter, OrquestraHtmlReporter, defineConfig } from "@orquestra/core";
import { createApp } from "./app";
import { PostgresOrquestraContainer, RabbitmqOrquestraContainer } from "./containers";
import { WorkerIsolationHelper } from "./helpers/isolation.helper";
import { CleanDatabaseOrquestraMacro } from "./macros/clean-database.orquestra-macro";
import { CreateUserOrquestraMacro } from "./macros/create-user.orquestra-macro";
import { AuthPlugin, DatabasePlugin, RabbitmqOrquestraPlugin } from "./plugins";

const dirname = import.meta.dirname

export default defineConfig({
	global: {
		containers: [PostgresOrquestraContainer, RabbitmqOrquestraContainer],
	},
	worker: {
		helpers: [WorkerIsolationHelper],
		httpServer: async () => {
			const { app, close } = await createApp();
			const adapter = new OrquestraAdapterExpress(app);
			adapter.setCloseHandler(close);
			return adapter;
		},
		plugins: [RabbitmqOrquestraPlugin, DatabasePlugin, AuthPlugin],
		macros: [CreateUserOrquestraMacro, CleanDatabaseOrquestraMacro],
	},
	env: {
		fromValues: {
			JWT_SECRET: "some secret key",
			FAKE_SERVER_URL: "http://fake-server.com",
			FOO: "bar",
		},
	},
	testMatch: ["**/*.feature.ts"],
	spec: "./orquestra.spec.ts",
	outputDir: resolve(dirname, "../../.orquestra"),
	reporters: [new OrquestraConsoleReporter(), new OrquestraHtmlReporter({ outputDir: "html" })],
	concurrency: 2,
});
