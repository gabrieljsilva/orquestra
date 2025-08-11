import { HttpServerAdapter } from "@orquestra/core";
import { Express } from "express";
import request, { Test } from "supertest";
import TestAgent from "supertest/lib/agent";

export class OrquestraAdapterExpress extends HttpServerAdapter<Express> {
	createClient(): TestAgent<Test> {
		const agent = request(this.app);
		return this.wrapHttpMethods(agent);
	}
}
