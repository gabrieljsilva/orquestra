import { IOrquestraContext } from "../../types";
import { Logger } from "../logger";

export abstract class Injectable {
	protected ctx: IOrquestraContext;
	protected logger: Logger;

	public constructor(ctx: IOrquestraContext) {
		this.ctx = ctx;
		this.logger = new Logger({ level: "info", prefix: this.constructor.name });
	}

	public onStart?(): Promise<void> | void;
	public onTeardown?(): Promise<void> | void;
}
