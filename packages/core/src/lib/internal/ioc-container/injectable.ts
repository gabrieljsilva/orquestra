import { IOrquestraContext } from "../../types";

export abstract class Injectable {
	protected ctx: IOrquestraContext;

	public constructor(ctx: IOrquestraContext) {
		this.ctx = ctx;
	}

	public onStart?(): Promise<void> | void;
	public onTeardown?(): Promise<void> | void;
}
