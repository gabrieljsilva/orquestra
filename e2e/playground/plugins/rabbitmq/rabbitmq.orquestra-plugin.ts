import { OnStart, OrquestraPlugin } from "@orquestra/core";
import { TestRabbitmqService } from "./service";

export class RabbitmqOrquestraPlugin extends OrquestraPlugin implements OnStart {
	async onStart() {
		this.ctx.registerServices([TestRabbitmqService]);
	}
}
