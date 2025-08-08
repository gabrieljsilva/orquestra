import { RabbitMQContainer, StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { Wait } from "testcontainers";
import { EnvHelper, OrquestraContainer } from "../../../../packages/core/src";

export class RabbitmqOrquestraContainer extends OrquestraContainer<StartedRabbitMQContainer> {
	public containerName = "rabbitmq";

	async up(): Promise<StartedRabbitMQContainer> {
		const startedContainer = await new RabbitMQContainer("rabbitmq:3.9-alpine")
			.withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
			.start();

		const env = this.ctx.container.get<EnvHelper>(EnvHelper);
		env.override("RABBITMQ_URL", startedContainer.getAmqpUrl());

		return startedContainer;
	}
}
