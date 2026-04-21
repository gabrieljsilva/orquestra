import { OrquestraService } from "@orquestra/core";
import amqplib from "amqplib";
import { retryUntil } from "../../../app/utils";

interface PublishMessageHelperInput {
	exchange: string;
	queue: string;
	message: any;
}

export class TestRabbitmqService extends OrquestraService {
	async publishMessage(input: PublishMessageHelperInput) {
		const { message, queue, exchange } = input;

		const { channel } = await this.createRabbitMQConnection();

		await channel.assertExchange(exchange, "topic", { durable: true });

		this.logger.info("Publishing message to RabbitMQ queue");
		channel.publish(exchange, queue, Buffer.from(JSON.stringify(message)));
	}

	async createRabbitMQConnection() {
		let retryCount = 0;
		return retryUntil(async () => {
			this.logger.info(`Creating RabbitMQ connection: ${retryCount++}/5`);
			const connectionUrl = process.env.RABBITMQ_URL;

			if (!connectionUrl) {
				throw new Error("Environment variable RABBITMQ_URL is not set");
			}

			const conn = await amqplib.connect(connectionUrl);

			const ch = await conn.createChannel();

			this.logger.info("RabbitMQ connection created");

			return {
				channel: ch,
			};
		}, 5);
	}
}
