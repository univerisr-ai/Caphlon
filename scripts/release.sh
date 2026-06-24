#!/usr/bin/env bash
# Caphlon Release Script — orchestrates all package releases
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> (e.g. 0.2.0)"
  echo ""
  echo "Releases all Caphlon packages with the same version."
  exit 1
fi

echo "╔══════════════════════════════════════════╗"
echo "║     Caphlon Release v$VERSION             ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. CLI ────────────────────────────────────────────────
echo ""
echo "▸ Publishing caphlon CLI (npm)..."
cd "$ROOT/packages/caphlon"
npm version "$VERSION" --no-git-tag-version
npm run typecheck
npm run build
npm publish --access public
echo "  ✅ caphlon@$VERSION published to npm"

# ── 2. VS Code Extension ─────────────────────────────────
echo ""
echo "▸ Packaging caphlon-vscode..."
cd "$ROOT/packages/caphlon-vscode"
npm version "$VERSION" --no-git-tag-version --no-git-tag-version
npm run build
npx vsce package --no-dependencies --out "caphlon-vscode-$VERSION.vsix"
echo "  ✅ caphlon-vscode-$VERSION.vsix created"

# ── 3. Docker ────────────────────────────────────────────
echo ""
echo "▸ Building Docker image..."
cd "$ROOT/packages/caphlon"
docker build -t "caphlon/caphlon:$VERSION" -t "caphlon/caphlon:latest" .
echo "  ✅ Docker image built: caphlon/caphlon:$VERSION"

# ── 4. Git Tag ───────────────────────────────────────────
echo ""
echo "▸ Tagging release..."
cd "$ROOT"
git add packages/caphlon/package.json packages/caphlon-vscode/package.json
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
git push && git push --tags
echo "  ✅ Tagged v$VERSION"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Caphlon v$VERSION released!              ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo " Published:"
echo "   npm:     caphlon@$VERSION"
echo "   vsix:    packages/caphlon-vscode/caphlon-vscode-$VERSION.vsix"
echo "   docker:  caphlon/caphlon:$VERSION"
echo ""
echo " To push Docker:"
echo "   docker push caphlon/caphlon:$VERSION"
echo "   docker push caphlon/caphlon:latest"
