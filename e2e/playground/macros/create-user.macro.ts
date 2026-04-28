import { fakerPT_BR } from "@faker-js/faker";
import { defineMacro } from "@orquestra/core";
import { Factory } from "decorated-factory";
import { UserEntity } from "../app";

export interface CreateUserMacroContext {
	user: UserEntity;
}

export const createUserMacro = defineMacro<CreateUserMacroContext>({
	title: "there is a user registered in database",
	execute: async () => {
		const factory = new Factory(fakerPT_BR);
		const user = factory.one(UserEntity).without("id").plain();
		return { user: { id: 1, ...user } };
	},
});
