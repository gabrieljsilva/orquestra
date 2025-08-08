type LoggerLevel = "trace" | "debug" | "info" | "warn" | "error";

interface LoggerOptions {
	level: LoggerLevel | Partial<Record<LoggerLevel, boolean>>;
	prefix?: string;
}

const LEVEL_PRIORITY: Record<LoggerLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
};

const COLORS: Record<LoggerLevel, string> = {
	trace: "\x1b[0m", // default
	debug: "\x1b[0m", // default
	info: "\x1b[32m", // green
	warn: "\x1b[33m", // yellow/orange
	error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

export class Logger {
	private level: LoggerLevel | Partial<Record<LoggerLevel, boolean>>;
	private prefix?: string;

	constructor(options: LoggerOptions) {
		this.level = options.level;
		this.prefix = options.prefix;
	}

	private isLevelEnabled(level: LoggerLevel): boolean {
		if (typeof this.level === "string") {
			return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
		}
		return this.level[level] === true;
	}

	private formatArgs(level: LoggerLevel, args: any[]): any[] {
		const color = COLORS[level] || RESET;
		return [`${color}[${this.prefix || "Orquestra"}] -${RESET}`, ...args];
	}

	log(...args: any[]) {
		console.log(...this.formatArgs("info", args));
	}

	error(...args: any[]) {
		if (this.isLevelEnabled("error")) {
			console.error(...this.formatArgs("error", args));
		}
	}

	warn(...args: any[]) {
		if (this.isLevelEnabled("warn")) {
			console.warn(...this.formatArgs("warn", args));
		}
	}

	info(...args: any[]) {
		if (this.isLevelEnabled("info")) {
			console.info(...this.formatArgs("info", args));
		}
	}

	debug(...args: any[]) {
		if (this.isLevelEnabled("debug")) {
			console.debug(...this.formatArgs("debug", args));
		}
	}

	trace(...args: any[]) {
		if (this.isLevelEnabled("trace")) {
			console.trace(...this.formatArgs("trace", args));
		}
	}
}
