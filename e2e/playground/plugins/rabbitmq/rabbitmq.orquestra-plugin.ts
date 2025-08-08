import { OnStart, OrquestraPlugin } from "../../../../packages/core/src";
import { TestRabbitmqService } from "./service";

export class RabbitmqOrquestraPlugin extends OrquestraPlugin implements OnStart {
	async onStart() {
		this.ctx.registerServices([TestRabbitmqService]);
	}
}
