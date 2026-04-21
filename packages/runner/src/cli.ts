try {
	(process as { noDeprecation?: boolean }).noDeprecation = true;
} catch {
	// already enabled via --no-deprecation flag (property is readonly in that case)
}

import { defineCommand, runMain } from "citty";
import { testCommand } from "./lib/commands/test.command";
import { typesCommand } from "./lib/commands/types.command";

const main = defineCommand({
	meta: {
		name: "orquestra",
		description: "Business-Oriented Software Specification platform",
		version: "1.0.0",
	},
	subCommands: {
		test: testCommand,
		types: typesCommand,
	},
});

runMain(main);
