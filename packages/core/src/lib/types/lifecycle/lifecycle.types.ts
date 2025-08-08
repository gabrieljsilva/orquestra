import { LoadEnvOptions } from "../../helpers/env";
import { Logger } from "../../internal/logger";

export interface OnTeardown {
	onTeardown: () => Promise<void> | void;
}

export interface OnStart {
	onStart: () => Promise<void> | void;
}

export interface BootstrapManagerOptions {
	env?: LoadEnvOptions;
	logger?: Logger;
}
