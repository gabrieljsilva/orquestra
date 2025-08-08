import { Client } from "pg";

export async function createDatabaseConnection() {
	const connectionUrl = process.env.DATABASE_URL;

	const client = new Client(connectionUrl);
	await client.connect();

	return {
		connection: client,
		close: async () => {
			await client.end();
		},
	};
}
