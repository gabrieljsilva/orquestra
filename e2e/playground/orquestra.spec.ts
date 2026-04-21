import { defineSpec } from "@orquestra/core";

export default defineSpec({
	glossary: {
		user: "A person who interacts with the application. Has email, name, and password.",
		contract: "A legal agreement between a user and the platform.",
		"medical guide": "A document that describes a medical procedure or exam.",
	},
	domains: [
		{
			name: "user management",
			context: "Users need to register and authenticate to access the platform. This is the entry point for all other features.",
		},
		{
			name: "contracts",
			context: "After registration, users can create contracts that bind them to platform services.",
		},
	],
});
