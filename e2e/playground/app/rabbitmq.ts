import amqplib, { Channel } from "amqplib";
import { retryUntil } from "./utils";

export async function createRabbitMQConnection() {
	let retryCount = 0;
	return retryUntil(async () => {
		console.info(`[API]: Creating RabbitMQ connection: ${retryCount++}/5`);
		const connectionUrl = process.env.RABBITMQ_URL;

		if (!connectionUrl) {
			throw new Error("Environment variable RABBITMQ_URL is not set");
		}

		const conn = await amqplib.connect(connectionUrl);

		const ch = await conn.createChannel();

		console.info("[API]: RabbitMQ connection created");

		return {
			connection: conn,
			channel: ch,
			close: async () => {
				await ch.close();
				await conn.close();
			},
		};
	}, 5);
}

export async function consumeFromRabbitMQ(
	channel: Channel,
	exchangeName: string,
	queueName: string,
	handler: (msg: any) => Promise<void> | void,
) {
	await channel.assertExchange(exchangeName, "topic", { durable: true });
	const { queue } = await channel.assertQueue(queueName, { durable: true });
	await channel.bindQueue(queue, exchangeName, "#");
	await channel.consume(
		queue,
		async (message) => {
			if (!message) return;
			try {
				const payload = JSON.parse(message.content.toString());
				await handler(payload);
				channel.ack(message);
			} catch {
				channel.nack(message, false, false);
			}
		},
		{ noAck: false },
	);
}
