import { defineModule } from "@orquestra/core";
import { TestRabbitmqService } from "./test-rabbitmq.service";

export const rabbitmqModule = defineModule({
	services: [TestRabbitmqService],
});
