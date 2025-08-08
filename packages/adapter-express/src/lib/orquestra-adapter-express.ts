import { Express } from "express";
import request, { Test } from "supertest";
import TestAgent from "supertest/lib/agent";
import { HttpServerAdapter } from "@core";

export class OrquestraAdapterExpress extends HttpServerAdapter<Express> {
	createClient(): TestAgent<Test> {
		const agent = request(this.app);
		return this.wrapHttpMethods(agent);
	}
}
