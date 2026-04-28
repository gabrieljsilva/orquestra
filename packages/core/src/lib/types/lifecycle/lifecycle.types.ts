export interface OnTeardown {
	onTeardown: () => Promise<void> | void;
}

export interface OnStart {
	onStart: () => Promise<void> | void;
}
