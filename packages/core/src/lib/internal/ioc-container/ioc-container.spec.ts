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

		mockContext = {
			container: container,
			plugins: [],
			helpers: [],
			containers: [],
			services: [],
			registerHttpServer: vi.fn(),
			registerPlugins: vi.fn(),
			registerHelpers: vi.fn(),
			registerContainers: vi.fn(),
			registerServices: vi.fn(),
			getHttpServer: vi.fn(),
			getPluginProviders: vi.fn(),
			getHelperProviders: vi.fn(),
			getContainerProviders: vi.fn(),
			getServiceProviders: vi.fn(),
		};
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
});
