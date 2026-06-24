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
