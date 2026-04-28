import { defineModule } from "@orquestra/core";
import { TestDatabaseService } from "./test-database.service";

export const databaseModule = defineModule({
	services: [TestDatabaseService],
});
