import { strictEqual } from "node:assert";
import { faker } from "@faker-js/faker";
import { orquestra } from "@orquestra/core";
import { Factory } from "decorated-factory";
import { UserEntity } from "../app";
import { retryUntil } from "../app/utils";
import { TestAuthService } from "../modules/auth";
import { TestRabbitmqService } from "../modules/rabbitmq";

const factory = new Factory(faker);

const feature = orquestra.feature("user registration", {
	context:
		"Users must be able to register on the platform before accessing any feature. Registration can happen synchronously via HTTP or asynchronously via a message queue.",
	domain: "user management",
	as: "unauthenticated visitor",
	I: "want to create my account",
	so: "I can use the platform",
});

feature
	.scenario("should register via REST endpoint")
	.given("there is a clean database")
	.given("I have valid user data", () => {
		const user = factory.one(UserEntity).without("id").plain();
		return { user };
	})
	.when('I send POST to "/users"', async ({ user }) => {
		const response = await orquestra.http.post("/users").send(user);
		return { response };
	})
	.then("should return 200 with user data", ({ user, response }) => {
		strictEqual(response.statusCode, 200);
		strictEqual(response.body.name, user.name);
		strictEqual(response.body.email, user.email);
	});

feature
	.scenario("should register via RabbitMQ message")
	.given("there is a clean database")
	.given("I have valid user data", () => {
		const user = factory.one(UserEntity).without("id").plain();
		return { user };
	})
	.when("I publish the user to the users queue", async ({ user }) => {
		const rabbitmq = orquestra.get(TestRabbitmqService);
		await rabbitmq.publishMessage({
			queue: process.env.USERS_QUEUE as string,
			exchange: process.env.USERS_EXCHANGE as string,
			message: user,
		});
	})
	.then("the user should be persisted in the database", async ({ user }) => {
		const auth = orquestra.get(TestAuthService);
		const persisted = await retryUntil(() => auth.findUserByEmail(user.email), 5);
		strictEqual(persisted.email, user.email);
		strictEqual(persisted.name, user.name);
	});
