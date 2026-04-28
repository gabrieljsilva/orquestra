import { defineModule } from "@orquestra/core";
import { databaseModule } from "../database";
import { AuthService } from "./auth.service";
import { TestAuthService } from "./test-auth.service";

export const authModule = defineModule({
	services: [AuthService, TestAuthService],
	modules: [databaseModule],
});
