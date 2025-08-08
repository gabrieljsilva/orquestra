import { OnStart, OrquestraPlugin } from "../../../../packages/core/src";
import { TestDatabaseService } from "./services";

export class DatabasePlugin extends OrquestraPlugin implements OnStart {
	async onStart() {
		this.ctx.registerServices([TestDatabaseService]);
	}
}
