import "reflect-metadata";
import { StartedTestContainer } from "testcontainers";
import { EnvHelper } from "../../helpers/env";
import { IOrquestraContext } from "../../types";
import { OrquestraContainer } from "../orquestra-container";
import { BootstrapManager } from "./bootstrap.manager";

class MockContainerA extends OrquestraContainer<StartedTestContainer> {
	constructor(ctx: IOrquestraContext) {
		super(ctx);
		this.containerName = "mock-container-a";
	}

	async up(): Promise<any> {
		return {
			stop: vi.fn(),
		} as unknown as StartedTestContainer;
	}
}

class MockContainerB extends OrquestraContainer<StartedTestContainer> {
	constructor(ctx: IOrquestraContext) {
		super(ctx);
		this.containerName = "mock-container-b";
	}

	async up(): Promise<any> {
		return {
			stop: vi.fn(),
		} as unknown as StartedTestContainer;
	}
}

class MockContainerC extends OrquestraContainer<StartedTestContainer> {
	constructor(ctx: IOrquestraContext) {
		super(ctx);
		this.containerName = "mock-container-c";
	}

	async up(): Promise<any> {
		return {
			stop: vi.fn(),
		} as unknown as StartedTestContainer;
	}
}

function createMockContext(): IOrquestraContext {
	const mockContainer = {
		register: vi.fn(),
		resolve: vi.fn().mockResolvedValue({
			start: vi.fn(),
			onStart: vi.fn(),
			onTeardown: vi.fn(),
			containerName: "mock-container",
			close: vi.fn(),
		}),
		get: vi.fn(),
	} as any;

	return {
		container: mockContainer as any,
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
		getPluginProviders: vi.fn().mockReturnValue([]),
		getHelperProviders: vi.fn().mockReturnValue([]),
		getContainerProviders: vi.fn().mockReturnValue([]),
		getServiceProviders: vi.fn().mockReturnValue([]),
	} as unknown as IOrquestraContext;
}

describe("BootstrapManager", () => {
	let ctx: IOrquestraContext;
	let manager: BootstrapManager;
	const mockLogger = {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();

		ctx = createMockContext();
		manager = new BootstrapManager(ctx, { logger: mockLogger });
	});

	it("should register EnvHelper when instantiated", () => {
		expect(ctx.container.register).toHaveBeenCalledWith(expect.objectContaining({ provide: EnvHelper }));
	});

	it("should start components in the correct order", async () => {
		const order: string[] = [];

		vi.spyOn(manager as any, "startHelpers").mockImplementation(async () => {
			order.push("helpers");
		});

		vi.spyOn(manager as any, "startContainers").mockImplementation(async () => {
			order.push("containers");
		});

		vi.spyOn(manager as any, "startHttpServer").mockImplementation(async () => {
			order.push("http");
		});

		vi.spyOn(manager as any, "startPlugins").mockImplementation(async () => {
			order.push("plugins");
		});

		vi.spyOn(manager as any, "startServices").mockImplementation(async () => {
			order.push("services");
		});

		await manager.start();

		expect(order).toEqual(["helpers", "containers", "http", "plugins", "services"]);
	});

	it("should skip container start when skipContainers option is passed", async () => {
		const startContainersSpy = vi.spyOn(manager as any, "startContainers");

		await manager.start({ skipContainers: true });

		expect(startContainersSpy).not.toHaveBeenCalled();
	});

	it("should teardown components in the correct order", async () => {
		const order: string[] = [];

		vi.spyOn(manager as any, "teardownServices").mockImplementation(async () => {
			order.push("services");
		});

		vi.spyOn(manager as any, "teardownPlugins").mockImplementation(async () => {
			order.push("plugins");
		});

		vi.spyOn(manager as any, "teardownHttpServer").mockImplementation(async () => {
			order.push("http");
		});

		vi.spyOn(manager as any, "teardownContainers").mockImplementation(async () => {
			order.push("containers");
		});

		vi.spyOn(manager as any, "teardownHelpers").mockImplementation(async () => {
			order.push("helpers");
		});

		await manager.teardown();

		expect(order).toEqual(["services", "plugins", "http", "containers", "helpers"]);
	});

	it("should skip container teardown when skipContainers option is passed", async () => {
		const teardownContainersSpy = vi.spyOn(manager as any, "teardownContainers");

		await manager.teardown({ skipContainers: true });

		expect(teardownContainersSpy).not.toHaveBeenCalled();
	});
});
