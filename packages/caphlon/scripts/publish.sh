#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> (e.g. 0.2.0)"
  exit 1
fi

# Update version
npm version "$VERSION" --no-git-tag-version

# Typecheck
npm run typecheck

# Build
npm run build

# Paket duman testi: npm pack + TEMİZ dizinde kur ve çalıştır.
# (devDependencies'e kaçmış runtime bağımlılığı sınıfı hataları publish'ten
# ÖNCE yakalar — monorepo'daki lokal node_modules bu hatayı maskeler.)
TARBALL="$(npm pack --silent)"
SMOKE="$(mktemp -d)"
( cd "$SMOKE" && npm init -y >/dev/null 2>&1 && npm install --silent "$ROOT/$TARBALL" \
  && ./node_modules/.bin/caphlon --version )
rm -rf "$SMOKE" "$ROOT/$TARBALL"
echo "✓ pack duman testi geçti (temiz dizinde caphlon --version çalıştı)"

# Publish to npm
npm publish --access public

# Tag and push
git add package.json
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
git push && git push --tags

echo ""
echo "✅ Caphlon v$VERSION published!"
echo "   https://www.npmjs.com/package/caphlon"
echo ""
echo "Next steps:"
echo "   docker build -t caphlon/caphlon:v$VERSION -t caphlon/caphlon:latest ."
echo "   docker push caphlon/caphlon:v$VERSION"
echo "   docker push caphlon/caphlon:latest"
