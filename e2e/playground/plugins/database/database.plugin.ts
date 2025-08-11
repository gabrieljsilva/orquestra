import { OnStart, OrquestraPlugin } from "@orquestra/core";
import { TestDatabaseService } from "./services";

export class DatabasePlugin extends OrquestraPlugin implements OnStart {
	async onStart() {
		this.ctx.registerServices([TestDatabaseService]);
	}
}
