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

		console.info("[ORQUESTRA]: Publishing message to RabbitMQ queue");
		channel.publish(exchange, queue, Buffer.from(JSON.stringify(message)));
	}

	async createRabbitMQConnection() {
		let retryCount = 0;
		return retryUntil(async () => {
			console.info(`[ORQUESTRA]: Creating RabbitMQ connection: ${retryCount++}/5`);
			const connectionUrl = process.env.RABBITMQ_URL;

			if (!connectionUrl) {
				throw new Error("Environment variable RABBITMQ_URL is not set");
			}

			const conn = await amqplib.connect(connectionUrl);

			const ch = await conn.createChannel();

			console.info("[ORQUESTRA]: RabbitMQ connection created");

			return {
				channel: ch,
			};
		}, 5);
	}
}
