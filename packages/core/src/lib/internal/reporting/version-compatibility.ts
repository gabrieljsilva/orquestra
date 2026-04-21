interface SemVer {
	major: number;
	minor: number;
	patch: number;
}

function parseSemVer(input: string): SemVer | null {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(input);
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function assertCompatible(manifestVersion: string, currentVersion: string): void {
	const manifest = parseSemVer(manifestVersion);
	const current = parseSemVer(currentVersion);

	if (!manifest || !current) {
		console.warn(
			`[Orquestra] Versao de manifest invalida (${manifestVersion}) ou atual (${currentVersion}); pulando check de compatibilidade.`,
		);
		return;
	}

	if (manifest.major !== current.major) {
		throw new Error(
			`Run foi gerado com @orquestra/core v${manifestVersion}, incompativel com a versao atual v${currentVersion} (major divergente). Reportagem abortada.`,
		);
	}

	if (manifest.minor !== current.minor) {
		console.warn(
			`[Orquestra] Run gerado em v${manifestVersion}, rodando em v${currentVersion} (minor divergente). Algumas informacoes podem nao ser exibidas corretamente.`,
		);
	}
}
