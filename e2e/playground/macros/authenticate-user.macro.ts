import { defineMacro } from "@orquestra/core";
import type { UserEntity } from "../app";
import { TestAuthService } from "../modules/auth";

export interface AuthenticateUserMacroInput {
	user: UserEntity;
}

export interface AuthenticateUserMacroContext {
	token: string;
}

export const authenticateUserMacro = defineMacro<AuthenticateUserMacroContext, AuthenticateUserMacroInput>({
	title: "that user logs in",
	execute: async (ctx, { user }) => {
		const auth = ctx.get(TestAuthService);
		const { token } = await auth.makeLogin({
			email: user.email,
			password: user.password,
		});
		return { token };
	},
});
