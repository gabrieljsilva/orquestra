import { IOrquestraContext } from "../../types";
import { Logger } from "../logger";
import { Injectable } from "./injectable";
import { IocContainer } from "./ioc-container";

describe("IocContainer", () => {
	let container: IocContainer;
	let mockLogger: Logger;
	let mockContext: IOrquestraContext;

	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		} as unknown as Logger;

		container = new IocContainer(mockLogger);

		mockContext = { container };
	});

	it("should register a class provider", () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		const result = container.register(TestService);

		expect(result).toBe(TestService);

		expect(mockLogger.debug).toHaveBeenCalledWith("Registered class provider: TestService");
	});

	it("should register a value provider", () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		const testInstance = new TestService(mockContext);

		const token = "TEST_SERVICE";
		const result = container.register({
			provide: token,
			useValue: testInstance,
		});

		expect(result).toBe(token);

		expect(mockLogger.debug).toHaveBeenCalledWith(`Registered provider: ${token}`);
		expect(mockLogger.debug).toHaveBeenCalledWith(`Registered value provider: ${token}`);

		expect(container.get(token)).toBe(testInstance);
	});

	it("should register a factory provider", () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		const factory = (ctx: IOrquestraContext) => new TestService(ctx);

		const token = "TEST_SERVICE";
		const result = container.register({
			provide: token,
			useFactory: factory,
		});

		expect(result).toBe(token);

		expect(mockLogger.debug).toHaveBeenCalledWith(`Registered provider: ${token}`);
	});

	it("should get a registered instance", () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		const testInstance = new TestService(mockContext);

		container.register({
			provide: "TEST_SERVICE",
			useValue: testInstance,
		});

		const result = container.get("TEST_SERVICE");

		expect(result).toBe(testInstance);
	});

	it("should return undefined when getting an unregistered instance", () => {
		const result = container.get("NONEXISTENT_SERVICE");

		expect(result).toBeUndefined();
	});

	it("should resolve a class provider", async () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		container.register(TestService);

		const instance = await container.resolve<TestService>(mockContext, TestService);

		expect(instance).toBeInstanceOf(TestService);
		expect(instance.testMethod()).toBe("test");

		expect(mockLogger.debug).toHaveBeenCalledWith(`Resolving provider for: ${TestService}`);
		expect(mockLogger.debug).toHaveBeenCalledWith(`Creating instance from class provider: ${TestService}`);
		expect(mockLogger.debug).toHaveBeenCalledWith(`Successfully resolved provider for: ${TestService}`);
	});

	it("should resolve a factory provider", async () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		const factory = (ctx: IOrquestraContext) => new TestService(ctx);

		const token = "TEST_SERVICE";
		container.register({
			provide: token,
			useFactory: factory,
		});

		const instance = await container.resolve<TestService>(mockContext, token);

		expect(instance).toBeInstanceOf(TestService);
		expect(instance.testMethod()).toBe("test");

		expect(mockLogger.debug).toHaveBeenCalledWith(`Resolving provider for: ${token}`);
		expect(mockLogger.debug).toHaveBeenCalledWith(`Creating instance from factory provider: ${token}`);
		expect(mockLogger.debug).toHaveBeenCalledWith(`Successfully resolved provider for: ${token}`);
	});

	it("should resolve a value provider", async () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		const testInstance = new TestService(mockContext);

		const token = "TEST_SERVICE";
		container.register({
			provide: token,
			useValue: testInstance,
		});

		const instance = await container.resolve(mockContext, token);

		expect(instance).toBe(testInstance);

		expect(mockLogger.debug).toHaveBeenCalledWith(`Returning cached instance for: ${token}`);
	});

	it("should throw an error when resolving an unregistered provider", async () => {
		await expect(container.resolve(mockContext, "NONEXISTENT_SERVICE")).rejects.toThrow(
			"Provider not found for token: NONEXISTENT_SERVICE",
		);

		expect(mockLogger.debug).toHaveBeenCalledWith("Resolving provider for: NONEXISTENT_SERVICE");
		expect(mockLogger.error).toHaveBeenCalledWith("Provider not found for token: NONEXISTENT_SERVICE");
	});

	it("should cache resolved instances", async () => {
		class TestService extends Injectable {
			public testMethod() {
				return "test";
			}
		}

		container.register(TestService);

		const instance1 = await container.resolve(mockContext, TestService);
		const instance2 = await container.resolve(mockContext, TestService);

		expect(instance1).toBe(instance2);

		expect(mockLogger.debug).toHaveBeenCalledWith(`Returning cached instance for: ${TestService}`);
	});

	it("should handle dependency injection between two injectables", async () => {
		class UserRepository extends Injectable {
			public findUserById(id: number) {
				return { id, name: "Test User" };
			}
		}

		class UserService extends Injectable {
			private userRepository: UserRepository;

			constructor(ctx: IOrquestraContext) {
				super(ctx);
				this.userRepository = ctx.container.get<UserRepository>(UserRepository);
			}

			public async getUserById(id: number) {
				if (!this.userRepository) {
					this.userRepository = await this.ctx.container.resolve(this.ctx, UserRepository);
				}
				return this.userRepository.findUserById(id);
			}
		}

		container.register(UserRepository);
		container.register(UserService);

		await container.resolve(mockContext, UserRepository);

		const userService = await container.resolve<UserService>(mockContext, UserService);

		const user = await userService.getUserById(1);

		expect(user).toEqual({ id: 1, name: "Test User" });
	});

	it("should throw an error for unknown provider type", async () => {
		const token = "INVALID_PROVIDER";
		container.register({
			provide: token,
			// @ts-ignore - Intentionally creating an invalid provider for testing
			invalidProperty: "value",
		});

		await expect(container.resolve(mockContext, token)).rejects.toThrow("Unknown provider type");

		expect(mockLogger.error).toHaveBeenCalledWith(`Unknown provider type for: ${token}`);
	});

	it("concurrent resolve calls share the same in-flight Promise (no double factory)", async () => {
		let factoryCalls = 0;
		const token = "SLOW_FACTORY";
		container.register({
			provide: token,
			useFactory: async () => {
				factoryCalls += 1;
				await new Promise((r) => setTimeout(r, 20));
				return { id: factoryCalls };
			},
		});

		const [a, b, c] = await Promise.all([
			container.resolve<{ id: number }>(mockContext, token),
			container.resolve<{ id: number }>(mockContext, token),
			container.resolve<{ id: number }>(mockContext, token),
		]);

		expect(factoryCalls).toBe(1);
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it("after resolution the in-flight map is cleared so failures don't poison the cache", async () => {
		let attempts = 0;
		const token = "FLAKY_FACTORY";
		container.register({
			provide: token,
			useFactory: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("first attempt fails");
				return { ok: true };
			},
		});

		await expect(container.resolve(mockContext, token)).rejects.toThrow("first attempt fails");
		const second = await container.resolve<{ ok: boolean }>(mockContext, token);

		expect(attempts).toBe(2);
		expect(second).toEqual({ ok: true });
	});

	it("get() logs a warning when provider is registered but instance not yet resolved", () => {
		class LazyService extends Injectable {}
		container.register({
			provide: LazyService,
			useFactory: async (ctx) => new LazyService(ctx),
		});

		const result = container.get(LazyService);

		expect(result).toBeUndefined();
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.stringContaining("returned undefined — provider is registered but not yet instantiated"),
		);
	});

	it("get() does not warn for tokens that were never registered", () => {
		container.get("NEVER_REGISTERED");
		expect(mockLogger.warn).not.toHaveBeenCalled();
	});
});
