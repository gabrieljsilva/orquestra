import express from "express";
import jwt from "jsonwebtoken";
import { createDatabaseConnection } from "./database";
import { consumeFromRabbitMQ, createRabbitMQConnection } from "./rabbitmq";
import { APIRepository } from "./repository";
import axios from "axios";

export async function createApp() {
	const JWT_SECRET = process.env.JWT_SECRET || "secret";

	const app = express();
	const databaseClient = await createDatabaseConnection();
	const repository = new APIRepository(databaseClient.connection);

	const rabbitConnection = await createRabbitMQConnection();

	app.use(express.json());

	app.get("/", (_req, res) => {
		res.send({ message: "Hello World!" });
	});

	app.post("/users", async (req, res) => {
		const { name, email, password } = req.body;
		await repository.createUser(name, email, password);
		res.send({ name, email });
	});

	app.post("/auth/login", async (req, res) => {
		const { email, password } = req.body;

		const user = await repository.findUserByEmailAndPassword(email, password);

		if (!user) {
			return res.status(401).send({ message: "Unauthorized" });
		}

		const token = jwt.sign({ id: user.id }, JWT_SECRET);

		res.send({ token });
	});

	app.get("/users", async (req, res) => {
		const authorization = req.headers.authorization;

		if (!authorization) {
			return res.status(401).send({ message: "Unauthorized" });
		}

		const [bearer, token] = authorization.split(" ");

		if (bearer !== "Bearer" || !token) {
			return res.status(401).send({ message: "Unauthorized" });
		}

		const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
		const user = await repository.findUserById(decoded.id);

		if (!user) {
			return res.status(401).send({ message: "Unauthorized" });
		}

		const users = await repository.findUsers();
		res.send(users);
	});

	app.post("/refresh", async (_req, res) => {
		const notificationUrl = process.env.FAKE_SERVER_URL;
		const url = `${notificationUrl}/notify`;

		await axios.post(url, { message: "Hello World!" });

		res.send({ sent: true });
	});

	await consumeFromRabbitMQ(rabbitConnection.channel, "users", "users.created", async (msg) => {
		const { name, email, password } = msg;
		await repository.createUser(name, email, password);
	});

	return {
		app,
		close: async () => {
			await rabbitConnection.close();
			await databaseClient.close();
		},
	};
}
