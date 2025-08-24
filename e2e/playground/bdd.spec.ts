import { faker } from "@faker-js/faker";
import { Orquestra } from "@orquestra/core";
import { Factory } from "decorated-factory";
import { UserEntity } from "./app";

describe("user", () => {
	const factory = new Factory(faker);

	const orquestra = new Orquestra({
		env: {
			fromValues: {
				JWT_SECRET: "some secret key",
				FOO: "bar",
			},
		},
		containers: [],
		plugins: [],
	});

	beforeAll(async () => {
		await orquestra.start();
	});

	afterAll(async () => {
		await orquestra.teardown();
	});

	test("create a user test", async () => {
		const feature = orquestra.feature("create user", {
			as: "unauthenticated visitor",
			I: "want to register",
			so: "I can use the app",
		});

		feature
			.scenario("it should create a user successfully")
			.given("I have a valid email and password", () => {
				const user = factory.one(UserEntity).without("id").plain();
				return { user };
			})
			.when('I send a POST request to "/users" with valid body', async ({ user }) => {
				const response = { status: 200, token: "some token", user: { id: 1, ...user } };

				return { response };
			})
			.then("should return a 200 status code", async ({ response }) => {
				expect(response.status).toBe(200);
			})
			.then("a user with the same email should be created", async ({ user, response }) => {
				expect(user.email).toBe(response.user.email);
			});

		feature
			.scenario("it should create contract successfully")
			.given("there is a user registered in database", async () => {
				const user = factory.one(UserEntity).without("id").plain();
				return { user: { id: 1, ...user } };
			})
			.when('I send a POST request to "/contracts" with valid body', async ({ user }) => {
				const response = { status: 200, token: "some token", contract: { id: 1, name: "Sami Orion", user: user } };
				return { response };
			})
			.then("should return a 200 status code", async ({ response }) => {
				expect(response.status).toBe(200);
			});

		feature
			.scenario("it should create a medical guide successfully")
			.given<{ user: UserEntity }>("there is a user registered in database")
			.when('I send a post request to "/medical-guides" with a valid body', async ({ user }) => {
				const response = { status: 200, token: "some token", medicalGuide: { id: 1, type: "exam", user: user } };
				return { response };
			})
			.then("should return a 200 status code", async ({ response }) => {
				expect(response.status).toBe(200);
			});

		await feature.test();
	});
});
