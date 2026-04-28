import type { IIocContainer } from "../ioc";

/**
 * Minimal context contract exposed to injectable components. Provides access
 * to the IoC container, which is the canonical way to fetch other services
 * and helpers (e.g. `this.ctx.container.get(EnvHelper)`).
 *
 * Provider registration is handled internally by the Bootstrap orchestrator
 * during the resolution phase — components no longer mutate the context at
 * runtime in v3.
 */
export interface IOrquestraContext {
	container: IIocContainer;
}
