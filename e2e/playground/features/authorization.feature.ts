import { strictEqual } from "node:assert";
import { orquestra } from "@orquestra/core";
import { AuthPlugin } from "../plugins/auth/auth.plugin";
import { TestAuthService } from "../plugins/auth/services";

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
		const authPlugin = orquestra.get(AuthPlugin);
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
	.given("there is a user registered in database")
	.given("I have an auth token for the registered user", async ({ user }) => {
		const authService = orquestra.get(TestAuthService);
		await authService.createUser(user);
		const { token } = await authService.makeLogin({ email: user.email, password: user.password });
		const authPlugin = orquestra.get(AuthPlugin);
		authPlugin.setToken(token);
		return { token };
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
