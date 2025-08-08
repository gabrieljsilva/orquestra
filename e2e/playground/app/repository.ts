import { Client } from "pg";

export class APIRepository {
	private client: Client;

	constructor(client: Client) {
		this.client = client;
	}

	async createUser(name: string, email: string, password: string) {
		const query = `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)`;
		await this.client.query(query, [name, email, password]);
	}

	async findUserByEmailAndPassword(email: string, password: string) {
		const query = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`;
		const result = await this.client.query(query);
		return result.rows[0];
	}

	async findUserById(id: number) {
		const query = `SELECT * FROM users WHERE id = '${id}'`;
		const result = await this.client.query(query);
		return result.rows[0];
	}

	async findUsers() {
		const query = `SELECT id, name, email FROM users`;
		const result = await this.client.query(query);
		return result.rows;
	}
}
