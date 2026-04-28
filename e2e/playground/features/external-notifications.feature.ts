import { strictEqual } from "node:assert";
import { attach, log, orquestra } from "@orquestra/core";
import nock from "nock";

const feature = orquestra.feature("external notifications", {
	context:
		"The platform dispatches notifications to an external service on specific events. The outbound call must succeed with a mocked server so tests don't depend on third-party availability.",
	domain: "integrations",
	as: "platform",
	I: "want to notify an external service",
	so: "downstream systems can react to events",
});

feature
	.scenario("should POST to the external notify endpoint")
	.given("the external notifications server is reachable", () => {
		const fakeServer = process.env.FAKE_SERVER_URL as string;
		log("fake_server_url", fakeServer);
		nock.cleanAll();
		const scope = nock(fakeServer).post("/notify").reply(200, { success: true });
		return { scope };
	})
	.when('I send POST to "/refresh"', async () => {
		const response = await orquestra.http.post("/refresh");
		attach({ name: "Refresh response", type: "json", data: response.body });
		log("status_code", response.statusCode);
		return { response };
	})
	.then("should return 200", ({ response }) => {
		strictEqual(response.statusCode, 200);
	})
	.then("should have called the external notify endpoint", ({ scope }) => {
		attach({
			name: "Pending mocks",
			type: "markdown",
			data: scope.isDone() ? "All expected calls were made." : "Some mocks were never called — check the request flow.",
		});
		scope.done();
	});
