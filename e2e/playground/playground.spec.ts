import "reflect-metadata";
import { faker } from "@faker-js/faker";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { EnvHelper, Orquestra } from "@orquestra/core";
import { Factory } from "decorated-factory";
import nock from "nock";
import { UserEntity, createApp } from "./app";
import { retryUntil } from "./app/utils";
import { PostgresOrquestraContainer, RabbitmqOrquestraContainer } from "./containers";
import { AuthPlugin, DatabasePlugin, RabbitmqOrquestraPlugin } from "./plugins";
import { TestAuthService } from "./plugins/auth/services";
import { TestDatabaseService } from "./plugins/database/services";
import { TestRabbitmqService } from "./plugins/rabbitmq/service";

describe(
	"playground",
	async () => {
		const factory = new Factory(faker);
		let authService: TestAuthService;
		let databaseService: TestDatabaseService;
		let rabbitmqService: TestRabbitmqService;
		const FAKE_SERVER_URL = "http://fake-server.com";

		const orquestra = new Orquestra({
			env: {
				fromValues: {
					JWT_SECRET: "some secret key",
					FOO: "bar",
					FAKE_SERVER_URL,
				},
			},
			httpServer: async () => {
				const { app, close } = await createApp();
				const adapter = new OrquestraAdapterExpress(app);
				adapter.setCloseHandler(close);
				return adapter;
			},
			containers: [PostgresOrquestraContainer, RabbitmqOrquestraContainer],
			plugins: [RabbitmqOrquestraPlugin, DatabasePlugin, AuthPlugin],
		});

		beforeAll(async () => {
			await orquestra.start();

			databaseService = orquestra.get<TestDatabaseService>(TestDatabaseService);
			authService = orquestra.get<TestAuthService>(TestAuthService);
			rabbitmqService = orquestra.get<TestRabbitmqService>(TestRabbitmqService);

			await databaseService.migrate();

			nock.cleanAll();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		beforeEach(async () => {
			await databaseService.truncate();
		});

		it("should start orquestra with containers", async () => {
			const res = await orquestra.http.get("/");

			expect(res.statusCode).toBe(200);
			expect(res.body).toEqual({ message: "Hello World!" });
		});

		it("should create a user by REST API", async () => {
			const user = factory.one(UserEntity).without("id").plain();

			const res = await orquestra.http.post("/users").send(user);

			expect(res.statusCode).toBe(200);
			expect(res.body).toEqual({ name: user.name, email: user.email });
		});

		it("should create a user by RabbitMQ", async () => {
			const user = factory.one(UserEntity).without("id").plain();

			await rabbitmqService.publishMessage({
				queue: "users.created",
				exchange: "users",
				message: user,
			});

			const newUser = await retryUntil(() => authService.findUserByEmail(user.email), 5);

			expect(newUser).toEqual({
				id: 1,
				...user,
			});
		});

		it("should make login", async () => {
			const user = factory.one(UserEntity).without("id").plain();

			const createdAccount = await orquestra.http.post("/users").send(user);

			expect(createdAccount.statusCode).toBe(200);

			const loginResponse = await orquestra.http.post("/auth/login").send({
				email: user.email,
				password: user.password,
			});

			expect(loginResponse.statusCode).toBe(200);
			expect(loginResponse.body).toEqual({
				token: expect.any(String),
			});
		});

		it("should throw error 401 when fetching users with invalid credentials", async () => {
			const res = await orquestra.http.get("/users");
			expect(res.statusCode).toBe(401);
		});

		it("should fetch users with valid credentials", async () => {
			const createUserDto = factory.one(UserEntity).without("id").plain();
			await authService.createUser(createUserDto);

			const { token } = await authService.makeLogin({
				email: createUserDto.email,
				password: createUserDto.password,
			});

			const res = await orquestra.http.get("/users").set("Authorization", `Bearer ${token}`);

			expect(res.statusCode).toBe(200);
			expect(res.body).toEqual([
				{
					id: 1,
					name: createUserDto.name,
					email: createUserDto.email,
				},
			]);
		});

		it("should use auth plugin request hook", async () => {
			const createUserDto = factory.one(UserEntity).without("id").plain();
			await authService.createUser(createUserDto);

			const { token } = await authService.makeLogin({
				email: createUserDto.email,
				password: createUserDto.password,
			});

			const authPlugin = orquestra.get<AuthPlugin>(AuthPlugin);

			authPlugin.setToken(token);

			const res = await orquestra.http.get("/users");

			expect(res.statusCode).toBe(200);
			expect(res.body).toEqual([
				{
					id: 1,
					name: createUserDto.name,
					email: createUserDto.email,
				},
			]);
		});

		it("should fetch fake http server", async () => {
			const scope = nock(FAKE_SERVER_URL).post("/notify").reply(200, { success: true });
			await orquestra.http.post("/refresh");
			scope.done();
		});

		it("should restore environment variables", async () => {
			const env = orquestra.get<EnvHelper>(EnvHelper);
			env.override("FOO", "zero");

			const value = env.get("FOO");
			expect(value).toBe("zero");

			env.restore("FOO");

			const restored = env.get("FOO");
			expect(restored).toBe("bar");
		});
	},
	{ timeout: 1000 * 60 * 2 },
);
