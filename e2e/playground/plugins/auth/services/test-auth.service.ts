import { OrquestraHttpServer, OrquestraService } from "../../../../../packages/core/src";
import { TestDatabaseService } from "../../database/services";

interface CreateUserInput {
	name: string;
	email: string;
	password: string;
}

interface CreateUserOutput {
	id: number;
	name: string;
	email: string;
}

interface MakeLoginInput {
	email: string;
	password: string;
}

interface MakeLoginOutput {
	token: string;
}

export class TestAuthService extends OrquestraService {
	async createUser({ name, email, password }: CreateUserInput): Promise<CreateUserOutput> {
		const httpServer = this.ctx.container.get<OrquestraHttpServer>(OrquestraHttpServer);
		const client = httpServer.createClient();
		const response = await client.post("/users").send({ name, email, password });
		return response.body;
	}

	async findUserByEmail(email: string) {
		const databaseService = this.ctx.container.get<TestDatabaseService>(TestDatabaseService);

		const query = `SELECT * FROM users WHERE email = '${email}'`;
		const [user] = await databaseService.query(query);

		if (!user) {
			throw new Error("User not found");
		}

		return user;
	}

	async makeLogin({ email, password }: MakeLoginInput) {
		const httpServer = this.ctx.container.get<OrquestraHttpServer>(OrquestraHttpServer);
		const client = httpServer.createClient();

		const response = await client.post("/auth/login").send({ email, password });

		const token: string = response.body.token;

		if (!token) {
			throw new Error("cannot login with provided credentials");
		}

		return {
			token,
		};
	}
}
