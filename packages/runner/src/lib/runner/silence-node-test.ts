// Filters out the line-per-test output emitted by node:test's default reporter
// (spec format): "✔ name (Xms)", "✖ ...", "ℹ tests N", etc. The glyphs are
// specific to that reporter, so user-authored logs that don't start with one of
// them pass through unchanged. Prefer calling this AFTER app bootstrap so any
// legitimate startup error that happens to start with one of these glyphs is
// not swallowed.
//
// Built via `String.fromCharCode` to keep the ESC byte out of the source
// (biome's "noControlCharactersInRegex" rejects both `\x1b` and the literal
// char inside a regex literal). Runtime semantics are identical - matches the
// ANSI color-wrapped glyphs emitted by node:test's spec reporter.
const ESC = String.fromCharCode(0x1b);
const REPORTER_LINE = new RegExp(`^(?:${ESC}\\[[0-9;]*m)*[✔✖▶ℹ⚠‼]`);

type StdoutWrite = typeof process.stdout.write;

let originalWrite: StdoutWrite | null = null;

export function installNodeTestReporterFilter(): void {
	if (originalWrite) return;

	originalWrite = process.stdout.write.bind(process.stdout);
	const write = originalWrite;

	process.stdout.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
		const str = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
		if (REPORTER_LINE.test(str)) return true;
		return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
	}) as StdoutWrite;
}

export function uninstallNodeTestReporterFilter(): void {
	if (!originalWrite) return;
	process.stdout.write = originalWrite;
	originalWrite = null;
}
