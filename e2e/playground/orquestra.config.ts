import { resolve } from "node:path";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { OrquestraConsoleReporter, defineConfig } from "@orquestra/core";
import { createApp } from "./app";
import { PostgresOrquestraContainer, RabbitmqOrquestraContainer } from "./containers";
import { authenticateUserMacro, cleanDatabaseMacro, createUserMacro, persistUserMacro } from "./macros";
import { authModule, databaseModule, isolationModule, rabbitmqModule } from "./modules";

const dirname = import.meta.dirname;

export default defineConfig({
	global: {
		containers: [PostgresOrquestraContainer, RabbitmqOrquestraContainer],
	},
	worker: {
		httpServer: async () => {
			const { app, close } = await createApp();
			const adapter = new OrquestraAdapterExpress(app);
			adapter.setCloseHandler(close);
			return adapter;
		},
		modules: [isolationModule, databaseModule, rabbitmqModule, authModule],
		macros: [cleanDatabaseMacro, createUserMacro, persistUserMacro, authenticateUserMacro],
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
	reporters: [new OrquestraConsoleReporter()],
	concurrency: 2,
});
