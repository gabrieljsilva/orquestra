import { StartedTestContainer } from "testcontainers";
import { Injectable } from "../ioc-container";

export abstract class OrquestraContainer<T extends StartedTestContainer> extends Injectable {
	public containerName: string;
	public startedContainer?: T;

	abstract up(): Promise<T>;

	public unwrap(): T | undefined {
		return this.startedContainer;
	}

	public isRunning(): boolean {
		return !!this.startedContainer;
	}

	async start(): Promise<T> {
		this.startedContainer = await this.up();
		return this.startedContainer;
	}

	async stop(): Promise<void> {
		await this.down();
	}

	private async down(): Promise<void> {
		if (this.isRunning()) {
			await this.startedContainer.stop();
			this.startedContainer = undefined;
		}
	}
}
