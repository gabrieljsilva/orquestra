import { EnvHelper, OrquestraService } from "@orquestra/core";
import { Client } from "pg";

export class TestDatabaseService extends OrquestraService {
	async query(query: string) {
		const env = this.ctx.container.get<EnvHelper>(EnvHelper);
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
		console.info("[Orquestra]: Running migrations");
		await this.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL
            );`);
		console.info("[Orquestra]: Migrations finished");
	}

	async truncate() {
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
                 WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
                RAISE NOTICE 'Executando: %', stmt;
                EXECUTE stmt;
            END;
            $$;
		`;

		console.info("[ORQUESTRA]: Truncating tables");
		await this.query(query);
		console.info("[ORQUESTRA]: Tables truncated");
	}
}
