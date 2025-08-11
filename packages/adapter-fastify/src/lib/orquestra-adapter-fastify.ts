import { HttpServerAdapter } from "@orquestra/core";
import { FastifyInstance } from "fastify";
import request, { Test } from "supertest";
import TestAgent from "supertest/lib/agent";

export class OrquestraAdapterFastify extends HttpServerAdapter<FastifyInstance> {
	createClient(): TestAgent<Test> {
		const agent = request(this.app.server);
		return this.wrapHttpMethods(agent);
	}
}
