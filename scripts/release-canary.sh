#!/usr/bin/env bash
set -euo pipefail

# Guards: must be logged into npm + must have at least one pending changeset.
# We do NOT block on dirty packages/* sources — that's the work being published.
# Instead we snapshot the files `changeset version` will mutate and restore them
# after publish, so the local working tree returns to its pre-canary state
# (including any untracked changeset .md that gets consumed by `version`).

if ! npm whoami > /dev/null 2>&1; then
	echo "✗ não logado no npm — rode 'npm login' antes."
	exit 1
fi

pending=$(find .changeset -maxdepth 1 -name '*.md' ! -name 'README.md' | wc -l)
if [ "$pending" -eq 0 ]; then
	echo "✗ nenhum changeset pendente — rode 'npx changeset' antes."
	exit 1
fi

backup=$(mktemp -d)
trap 'rm -rf "$backup"' EXIT

snapshot_workspace() {
	local pkg=$1
	local name
	name=$(basename "$pkg")
	mkdir -p "$backup/$name"
	cp -a "$pkg/package.json" "$backup/$name/package.json"
	[ -f "$pkg/CHANGELOG.md" ] && cp -a "$pkg/CHANGELOG.md" "$backup/$name/CHANGELOG.md"
}

restore_workspace() {
	local pkg=$1
	local name
	name=$(basename "$pkg")
	cp -a "$backup/$name/package.json" "$pkg/package.json"
	if [ -f "$backup/$name/CHANGELOG.md" ]; then
		cp -a "$backup/$name/CHANGELOG.md" "$pkg/CHANGELOG.md"
	else
		rm -f "$pkg/CHANGELOG.md"
	fi
}

echo "→ snapshotting state of files that 'changeset version' touches"
cp -a .changeset "$backup/changeset"
[ -f package-lock.json ] && cp -a package-lock.json "$backup/package-lock.json"
for pkg in packages/*/; do snapshot_workspace "$pkg"; done
snapshot_workspace e2e/

echo "→ bumping versions for canary snapshot"
npx changeset version --snapshot canary

echo "→ building"
npm run build

echo "→ publishing"
npx changeset publish --tag canary --no-git-tag

echo "→ restoring local working tree"
rm -rf .changeset
cp -a "$backup/changeset" .changeset
[ -f "$backup/package-lock.json" ] && cp -a "$backup/package-lock.json" package-lock.json
for pkg in packages/*/; do restore_workspace "$pkg"; done
restore_workspace e2e/

echo "✓ canary published — install with @orquestra/<pkg>@canary"
