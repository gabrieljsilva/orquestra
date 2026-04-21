import { OrquestraMacro } from "@orquestra/core";
import { TestDatabaseService } from "../plugins/database/services";

export class CleanDatabaseOrquestraMacro extends OrquestraMacro {
	title = "there is a clean database";

	async execute() {
		const db = this.ctx.container.get(TestDatabaseService);
		await db.truncate();
	}
}
