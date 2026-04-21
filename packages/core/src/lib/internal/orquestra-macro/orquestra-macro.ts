import { Injectable } from "../ioc-container";

export abstract class OrquestraMacro<T extends object | void = void> extends Injectable {
	abstract title: string;
	abstract execute(ctx?: Readonly<any>): Promise<T> | T;
}
