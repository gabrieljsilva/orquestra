import { strictEqual } from "node:assert";
import { faker } from "@faker-js/faker";
import { orquestra } from "@orquestra/core";
import { Factory } from "decorated-factory";
import { UserEntity } from "../app";

const factory = new Factory(faker);

const feature = orquestra.feature("authentication", {
	context:
		"Registered users must be able to log in to obtain an access token. The token is required for any protected endpoint of the platform.",
	domain: "user management",
	as: "registered user",
	I: "want to log in",
	so: "I can access protected resources",
});

feature
	.scenario("should return a token for valid credentials")
	.given("there is a clean database")
	.given("a user is registered", async () => {
		const user = factory.one(UserEntity).without("id").plain();
		await orquestra.http.post("/users").send(user);
		return { user };
	})
	.when("I log in with correct email and password", async ({ user }) => {
		const response = await orquestra.http.post("/auth/login").send({
			email: user.email,
			password: user.password,
		});
		return { response };
	})
	.then("should return 200 with a token", ({ response }) => {
		strictEqual(response.statusCode, 200);
		strictEqual(typeof response.body.token, "string");
	});
