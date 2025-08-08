import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Wait } from "testcontainers";
import { EnvHelper, OrquestraContainer } from "../../../../packages/core/src";

export class PostgresOrquestraContainer extends OrquestraContainer<StartedPostgreSqlContainer> {
	public containerName = "postgres";

	async up(): Promise<StartedPostgreSqlContainer> {
		const startedContainer = await new PostgreSqlContainer("postgres:13.3-alpine")
			.withWaitStrategy(Wait.forHealthCheck())
			.start();
		const env = this.ctx.container.get<EnvHelper>(EnvHelper);
		const databaseUrl = startedContainer.getConnectionUri();
		env.override("DATABASE_URL", databaseUrl);

		return startedContainer;
	}
}
