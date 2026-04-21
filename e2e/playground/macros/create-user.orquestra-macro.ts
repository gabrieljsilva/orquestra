import { fakerPT_BR } from "@faker-js/faker";
import { OrquestraMacro } from "@orquestra/core";
import { Factory } from "decorated-factory";
import { UserEntity } from "../app";

export interface CreateUserMacroContext {
	user: UserEntity;
}

export class CreateUserOrquestraMacro extends OrquestraMacro<CreateUserMacroContext> {
	override title = "there is a user registered in database";

	async execute(): Promise<CreateUserMacroContext> {
		const factory = new Factory(fakerPT_BR);
		const user = factory.one(UserEntity).without("id").plain();
		return { user: { id: 1, ...user } };
	}
}
