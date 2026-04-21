import { EnvHelper, OrquestraContainer } from "@orquestra/core";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Wait } from "testcontainers";

export class PostgresOrquestraContainer extends OrquestraContainer<StartedPostgreSqlContainer> {
	public containerName = "postgres";

	async up(): Promise<StartedPostgreSqlContainer> {
		const startedContainer = await new PostgreSqlContainer("postgres:13.3-alpine")
			.withWaitStrategy(Wait.forHealthCheck())
			.start();
		const env = this.ctx.container.get<EnvHelper>(EnvHelper);
		env.override("DATABASE_BASE_URL", startedContainer.getConnectionUri());

		return startedContainer;
	}
}
