try {
	(process as { noDeprecation?: boolean }).noDeprecation = true;
} catch {
	// already enabled via --no-deprecation flag (property is readonly in that case)
}

import { defineCommand, runMain } from "citty";
import { getRunnerVersion } from "./lib/artifact";
import { cacheCommand } from "./lib/commands/cache.command";
import { generateCommand } from "./lib/commands/generate.command";
import { testCommand } from "./lib/commands/test.command";
import { typesCommand } from "./lib/commands/types.command";

const main = defineCommand({
	meta: {
		name: "orquestra",
		description: "Business-Oriented Software Specification platform",
		version: getRunnerVersion(),
	},
	subCommands: {
		test: testCommand,
		types: typesCommand,
		generate: generateCommand,
		cache: cacheCommand,
	},
});

runMain(main);
