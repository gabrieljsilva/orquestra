/**
 * Output of a single template rendering: a relative path under the project
 * root and the file content. The command writes them via `fs.writeFile` —
 * generators don't touch the filesystem themselves.
 */
export interface GeneratedFile {
	relativePath: string;
	content: string;
}

/**
 * Implementations describe one IDE/editor flavor. Adding support for a new
 * tool (e.g. nvim-dap, sublime, helix) is one new module that implements
 * this interface plus an entry in the registry.
 */
export interface DebugGenerator {
	/** Unique slug used by `--ide=<id>` (e.g. `vscode`, `webstorm`). */
	id: string;
	/** Human-readable label printed in logs. */
	displayName: string;
	/**
	 * Returns true when the project on disk looks like it already uses this
	 * IDE (e.g. `.vscode/` or `.idea/` exists). Used by auto-detect when no
	 * `--ide` flag is given.
	 */
	detect(cwd: string): boolean;
	/**
	 * Produces the files to be written, given the project root. Pure — no
	 * filesystem side effects. The command applies them with merge logic.
	 */
	files(cwd: string): GeneratedFile[];
	/**
	 * Optional merge strategy when the target file already exists. Receives
	 * the existing content and the freshly generated content, returns the
	 * final string to write. When omitted, `--force` is required to
	 * overwrite an existing file.
	 */
	merge?(existing: string, generated: string): string;
}
