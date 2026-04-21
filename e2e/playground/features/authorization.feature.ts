import { strictEqual } from "node:assert";
import { faker } from "@faker-js/faker";
import { orquestra } from "@orquestra/core";
import { Factory } from "decorated-factory";
import { UserEntity } from "../app";
import { AuthPlugin } from "../plugins/auth/auth.plugin";
import { TestAuthService } from "../plugins/auth/services";

const factory = new Factory(faker);

const feature = orquestra.feature("authorization", {
	context:
		"Access to user data is restricted to authenticated requests. Unauthenticated requests must be rejected with 401, and authenticated requests must return the data.",
	domain: "user management",
	as: "registered user",
	I: "want to list users",
	so: "I can see who is registered in the platform",
});

feature
	.scenario("should reject unauthenticated requests with 401")
	.given("there is a clean database")
	.given("I have no authentication token", () => {
		const authPlugin = orquestra.get<AuthPlugin>(AuthPlugin);
		authPlugin.clearToken();
	})
	.when('I send GET to "/users"', async () => {
		const response = await orquestra.http.get("/users");
		return { response };
	})
	.then("should return 401", ({ response }) => {
		strictEqual(response.statusCode, 401);
	});

feature
	.scenario("should list users when authenticated")
	.given("there is a clean database")
	.given("I am authenticated as a registered user", async () => {
		const authService = orquestra.get<TestAuthService>(TestAuthService);
		const user = factory.one(UserEntity).without("id").plain();
		await authService.createUser(user);
		const { token } = await authService.makeLogin({
			email: user.email,
			password: user.password,
		});
		const authPlugin = orquestra.get<AuthPlugin>(AuthPlugin);
		authPlugin.setToken(token);
		return { user, token };
	})
	.when('I send GET to "/users"', async () => {
		const response = await orquestra.http.get("/users");
		return { response };
	})
	.then("should return 200 with the users list", ({ user, response }) => {
		strictEqual(response.statusCode, 200);
		strictEqual(Array.isArray(response.body), true);
		strictEqual(response.body.length, 1);
		strictEqual(response.body[0].email, user.email);
	});
