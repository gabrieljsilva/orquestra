import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

export interface ExtractedMacro {
	identifier: string;
	title: string;
	filePath: string;
}

export function extractMacros(rootDir: string): ExtractedMacro[] {
	const files = collectTsFiles(rootDir);
	const macros: ExtractedMacro[] = [];

	for (const file of files) {
		const source = readFileSync(file, "utf8");
		const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);

		ts.forEachChild(sourceFile, function visit(node) {
			collectFromNode(node, file, macros);
			ts.forEachChild(node, visit);
		});
	}

	return macros;
}

function collectFromNode(node: ts.Node, file: string, macros: ExtractedMacro[]): void {
	if (!ts.isVariableStatement(node)) return;

	const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
	if (!isExported) return;

	for (const decl of node.declarationList.declarations) {
		if (!ts.isIdentifier(decl.name)) continue;
		if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;

		const callee = decl.initializer.expression;
		if (!ts.isIdentifier(callee) || callee.text !== "defineMacro") continue;

		const arg = decl.initializer.arguments[0];
		if (!arg || !ts.isObjectLiteralExpression(arg)) continue;

		const title = extractTitleFromObject(arg);
		if (!title) continue;

		macros.push({ identifier: decl.name.text, title, filePath: file });
	}
}

function extractTitleFromObject(obj: ts.ObjectLiteralExpression): string | null {
	for (const prop of obj.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		if (!prop.name || !ts.isIdentifier(prop.name) || prop.name.text !== "title") continue;
		const init = prop.initializer;
		if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
			return init.text;
		}
	}
	return null;
}

function collectTsFiles(dir: string): string[] {
	const IGNORED = new Set(["node_modules", "dist", ".orquestra", ".turbo", ".git"]);
	const files: string[] = [];

	const walk = (current: string) => {
		let entries: string[];
		try {
			entries = readdirSync(current);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (IGNORED.has(entry)) continue;
			const full = join(current, entry);
			// Use lstat to detect symlinks before following them. Skipping symlinks
			// here prevents recursion into symlink loops (which would stack-overflow)
			// and avoids escaping the project tree via a symlink to /.
			let lstat: ReturnType<typeof lstatSync>;
			try {
				lstat = lstatSync(full);
			} catch {
				continue;
			}
			if (lstat.isSymbolicLink()) continue;

			let stats: ReturnType<typeof statSync>;
			try {
				stats = statSync(full);
			} catch {
				continue;
			}
			if (stats.isDirectory()) {
				walk(full);
			} else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".spec.ts")) {
				files.push(resolve(full));
			}
		}
	};

	walk(dir);
	return files;
}
