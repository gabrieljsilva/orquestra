import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

export interface ExtractedMacro {
	className: string;
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
			if (ts.isClassDeclaration(node) && node.name && node.heritageClauses) {
				const extendsOrquestraMacro = node.heritageClauses.some(
					(hc) =>
						hc.token === ts.SyntaxKind.ExtendsKeyword &&
						hc.types.some((t) => {
							const expr = t.expression;
							return ts.isIdentifier(expr) && expr.text === "OrquestraMacro";
						}),
				);

				if (extendsOrquestraMacro) {
					const title = extractTitle(node);
					if (title) {
						macros.push({
							className: node.name.text,
							title,
							filePath: file,
						});
					}
				}
			}
			ts.forEachChild(node, visit);
		});
	}

	return macros;
}

function extractTitle(node: ts.ClassDeclaration): string | null {
	for (const member of node.members) {
		if (!ts.isPropertyDeclaration(member)) continue;
		if (!member.name || !ts.isIdentifier(member.name) || member.name.text !== "title") continue;
		if (!member.initializer) continue;
		if (ts.isStringLiteral(member.initializer) || ts.isNoSubstitutionTemplateLiteral(member.initializer)) {
			return member.initializer.text;
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
