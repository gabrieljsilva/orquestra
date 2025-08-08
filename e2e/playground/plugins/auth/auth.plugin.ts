import { OnStart, OrquestraHttpServer, OrquestraPlugin } from "../../../../packages/core/src";
import { HttpMethod } from "../../../../packages/core/src/lib/types";
import { TestAuthService } from "./services";

export class AuthPlugin extends OrquestraPlugin implements OnStart {
	private token: string | null = null;
	private authMethods: HttpMethod[] | "all" = "all";
	private httpServer: OrquestraHttpServer | null = null;

	async onStart() {
		this.httpServer = this.ctx.container.get<OrquestraHttpServer>(OrquestraHttpServer);

		this.ctx.registerServices([TestAuthService]);

		this.httpServer.addPreRequestHook((agent) => {
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
