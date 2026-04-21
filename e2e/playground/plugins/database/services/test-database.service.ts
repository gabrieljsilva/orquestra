import { EnvHelper, type OnStart, OrquestraService } from "@orquestra/core";
import { Client } from "pg";

export class TestDatabaseService extends OrquestraService implements OnStart {
	async onStart() {
		await this.migrate();
	}

	async query(query: string) {
		const env = this.ctx.container.get(EnvHelper);
		const databaseUrl = env.get("DATABASE_URL");
		const client = new Client(databaseUrl);

		await client.connect();

		try {
			const res = await client.query(query);
			return res.rows;
		} finally {
			await client.end();
		}
	}

	async migrate() {
		this.logger.info("Running migrations");
		await this.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL
            );`);
		this.logger.info("Migrations finished");
	}

	async truncate() {
		const env = this.ctx.container.get<EnvHelper>(EnvHelper);
		const schema = env.get("DATABASE_SCHEMA") || "public";

		const query = `
            DO
            $$
            DECLARE
                stmt text;
            BEGIN
                SELECT 'TRUNCATE TABLE '
                       || string_agg(format('%I.%I', schemaname, tablename), ', ')
                       || ' RESTART IDENTITY CASCADE'
                  INTO stmt
                  FROM pg_tables
                 WHERE schemaname = '${schema}';
                IF stmt IS NOT NULL THEN
                    EXECUTE stmt;
                END IF;
            END;
            $$;
		`;

		this.logger.info(`Truncating tables in schema ${schema}`);
		await this.query(query);
		this.logger.info("Tables truncated");
	}
}
