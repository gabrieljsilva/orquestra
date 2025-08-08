import {
	ClassConstructor,
	ClassProvider,
	FactoryProvider,
	IOrquestraContext,
	Provider,
	ProviderToken,
	ValueProvider,
} from "../../types";
import { IIocContainer } from "../../types";
import { Logger } from "../logger";
import { Injectable } from "./injectable";

export class IocContainer implements IIocContainer {
	private providers = new Map<ProviderToken, Provider<any>>();
	private instances = new Map<ProviderToken, any>();
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	register<T extends Injectable>(providerOrClass: Provider<T> | ClassConstructor<T>) {
		if (typeof providerOrClass === "function") {
			const provider: ClassProvider<T> = {
				provide: providerOrClass,
				useClass: providerOrClass,
			};
			this.providers.set(provider.provide, provider);
			this.logger.debug(`Registered class provider: ${providerOrClass.name}`);
			return providerOrClass;
		}

		this.providers.set(providerOrClass.provide, providerOrClass);
		this.logger.debug(`Registered provider: ${String(providerOrClass.provide)}`);

		if (this.isValueProvider(providerOrClass)) {
			this.instances.set(providerOrClass.provide, providerOrClass.useValue);
			this.logger.debug(`Registered value provider: ${String(providerOrClass.provide)}`);
		}

		return providerOrClass.provide;
	}

	get<T extends Injectable>(token: ProviderToken): T | undefined {
		return this.instances.get(token);
	}

	async resolve<T extends Injectable>(ctx: IOrquestraContext, token: ProviderToken): Promise<T> {
		if (this.instances.has(token)) {
			this.logger.debug(`Returning cached instance for: ${String(token)}`);
			return this.instances.get(token);
		}

		this.logger.debug(`Resolving provider for: ${String(token)}`);
		const provider = this.providers.get(token);

		if (!provider) {
			this.logger.error(`Provider not found for token: ${String(token)}`);
			throw new Error(`Provider not found for token: ${String(token)}`);
		}

		let instance: any;

		if (this.isClassProvider(provider)) {
			this.logger.debug(`Creating instance from class provider: ${String(token)}`);
			instance = new provider.useClass(ctx);
		} else if (this.isFactoryProvider(provider)) {
			this.logger.debug(`Creating instance from factory provider: ${String(token)}`);
			instance = await provider.useFactory(ctx);
		} else if (this.isValueProvider(provider)) {
			this.logger.debug(`Using value from provider: ${String(token)}`);
			instance = provider.useValue;
		} else {
			this.logger.error(`Unknown provider type for: ${String(token)}`);
			throw new Error("Unknown provider type");
		}

		this.instances.set(token, instance);
		this.logger.debug(`Successfully resolved provider for: ${String(token)}`);
		return instance as T;
	}

	private isClassProvider<T extends Injectable>(provider: Provider<T>): provider is ClassProvider<T> {
		return "useClass" in provider;
	}

	private isFactoryProvider<T extends Injectable>(provider: Provider<T>): provider is FactoryProvider<T> {
		return "useFactory" in provider;
	}

	private isValueProvider<T extends Injectable>(provider: Provider<T>): provider is ValueProvider<T> {
		return "useValue" in provider;
	}
}
