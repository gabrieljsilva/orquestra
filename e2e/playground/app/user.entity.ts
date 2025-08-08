import { AutoIncrement, FactoryType, FactoryValue } from "decorated-factory";

export class UserEntity {
	@FactoryType(() => AutoIncrement)
	id: number;

	@FactoryValue((faker) => faker.person.fullName())
	name: string;

	@FactoryValue((faker) => faker.internet.email())
	email: string;

	@FactoryValue((faker) => faker.internet.password({ length: 8 }))
	password: string;
}
