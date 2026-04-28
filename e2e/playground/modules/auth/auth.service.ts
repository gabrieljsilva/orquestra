import { type HttpMethod, type OnStart, OrquestraHttpServer, OrquestraService } from "@orquestra/core";

/**
 * Holds the current bearer token for the test session and registers a
 * pre-request hook that injects it into outgoing requests.
 */
export class AuthService extends OrquestraService implements OnStart {
	private token: string | null = null;
	private readonly authMethods: HttpMethod[] | "all" = "all";

	async onStart() {
		const httpServer = this.ctx.container.get(OrquestraHttpServer);
		httpServer.addPreRequestHook((agent) => {
			if (this.token) {
				agent.set("Authorization", `Bearer ${this.token}`);
			}
		}, this.authMethods);
	}

	setToken(token: string): void {
		this.token = token;
	}

	clearToken(): void {
		this.token = null;
	}
}
