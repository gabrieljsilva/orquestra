import type { LoadEnvOptions } from "../../helpers/env";
import type { Logger } from "../../internal/logger";
import type { ContainerProvider } from "../components";
import type { GlobalHookFn } from "../lifecycle/hook.types";

export interface GlobalOrquestraOptions {
	containers?: ReadonlyArray<ContainerProvider>;
	env?: LoadEnvOptions;
	logger?: Logger;
	beforeProvision?: ReadonlyArray<GlobalHookFn>;
	afterProvision?: ReadonlyArray<GlobalHookFn>;
	beforeDeprovision?: ReadonlyArray<GlobalHookFn>;
	afterDeprovision?: ReadonlyArray<GlobalHookFn>;
	/** Time budget per global hook (ms). Defaults to {@link DEFAULT_GLOBAL_HOOK_TIMEOUT_MS} when undefined. */
	hookTimeoutMs?: number;
}
