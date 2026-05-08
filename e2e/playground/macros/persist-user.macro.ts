import { defineMacro } from "@orquestra/core";
import type { UserEntity } from "../app";
import { TestAuthService } from "../modules/auth";

export interface PersistUserMacroInput {
	user: UserEntity;
}

export interface PersistUserMacroContext {
	persistedUser: { name: string; email: string };
}

export const persistUserMacro = defineMacro<PersistUserMacroContext, PersistUserMacroInput>({
	title: "that user is persisted in the database",
	execute: async (ctx, { user }) => {
		const auth = ctx.get(TestAuthService);
		const persistedUser = await auth.createUser({
			name: user.name,
			email: user.email,
			password: user.password,
		});
		return { persistedUser };
	},
});
