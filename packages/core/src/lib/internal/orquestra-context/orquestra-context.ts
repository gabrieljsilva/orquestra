import type { IIocContainer, IOrquestraContext } from "../../types";

export class OrquestraContext implements IOrquestraContext {
	constructor(public readonly container: IIocContainer) {}
}
