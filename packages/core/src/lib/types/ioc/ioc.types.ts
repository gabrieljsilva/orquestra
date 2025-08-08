import { Injectable } from "../../internal/ioc-container";
import { IOrquestraContext } from "../orquestra";

export interface IIocContainer {
	register<T extends Injectable>(
		providerOrClass: Provider<T> | ClassConstructor<T>,
	): ProviderToken | ClassConstructor<T>;
	register<T>(provider: { provide: ProviderToken; useValue: T }): ProviderToken;
	get<T extends Injectable>(token: ProviderToken): T | undefined;
	get<T>(token: ProviderToken): T | undefined;
	resolve<T extends Injectable>(ctx: IOrquestraContext, token: ProviderToken): Promise<T>;
}

export type ProviderToken = string | Function | Symbol;

export interface ClassConstructor<T extends Injectable = Injectable> {
	new (ctx: IOrquestraContext, ...args: any[]): T;
}

export interface ClassProvider<T extends Injectable = Injectable> {
	provide: ProviderToken;
	useClass: ClassConstructor<T>;
}

export interface FactoryProvider<T extends Injectable = Injectable> {
	provide: ProviderToken;
	useFactory: (ctx: IOrquestraContext) => Promise<T> | T;
}

export interface ValueProvider<T extends Injectable = Injectable> {
	provide: ProviderToken;
	useValue: T;
}

export type Provider<T extends Injectable = Injectable> = ClassProvider<T> | FactoryProvider<T> | ValueProvider<T>;
