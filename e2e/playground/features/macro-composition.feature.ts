import { strictEqual } from "node:assert";
import { orquestra } from "@orquestra/core";
import { AuthService } from "../modules/auth";

const feature = orquestra.feature("macro composition", {
	context:
		"Scenarios that need many states can be composed from atomic givens. Each macro reads the minimum it needs from the accumulated context and contributes data back for the next steps.",
	domain: "user management",
	as: "registered user",
	I: "want to log in and list users",
	so: "I can see who is registered in the platform",
});

feature
	.scenario("composes user setup from chained macros")
	.given("there is a clean database")
	.given("there is a user registered in database")
	.given("that user is persisted in the database")
	.given("that user logs in")
	.when("I authenticate with the issued token", ({ token }) => {
		orquestra.get(AuthService).setToken(token);
	})
	.when('I send GET to "/users"', async () => {
		const response = await orquestra.http.get("/users");
		return { response };
	})
	.then("should return 200 with the persisted user listed", ({ user, persistedUser, response }) => {
		strictEqual(response.statusCode, 200);
		strictEqual(Array.isArray(response.body), true);
		strictEqual(response.body.length, 1);
		strictEqual(response.body[0].email, user.email);
		strictEqual(persistedUser.email, user.email);
	});
