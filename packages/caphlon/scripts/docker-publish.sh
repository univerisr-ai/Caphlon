#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="caphlon/caphlon"
VERSION="${1:-latest}"

echo "Building Docker image: $IMAGE:$VERSION"
docker build -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .

echo ""
echo "Pushing..."
docker push "$IMAGE:$VERSION"
docker push "$IMAGE:latest"

echo ""
echo "✅ $IMAGE:$VERSION published"
echo "   docker run --rm $IMAGE:$VERSION --help"
