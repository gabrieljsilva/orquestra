import { defineMacro } from "@orquestra/core";
import { TestDatabaseService } from "../modules/database";

export const cleanDatabaseMacro = defineMacro({
	title: "there is a clean database",
	execute: async (ctx) => {
		const db = ctx.get(TestDatabaseService);
		await db.truncate();
	},
});
