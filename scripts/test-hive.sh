#!/usr/bin/env bash
# Kovan Zekası test koşucusu — saf stdlib, ek bağımlılık YOK (torch/pytest gerekmez).
# Tüm hive testlerini tek komutta çalıştırır.  Kullanım:  bash scripts/test-hive.sh
set -euo pipefail

cd "$(dirname "$0")/../core"

PY="${PYTHON:-python3}"
echo "🐝 Kovan testleri — $($PY --version)"

$PY -m unittest -v \
  test_hive \
  test_hive_server \
  test_hive_fed \
  test_trajectory \
  test_fed_aggregate \
  test_local_ensemble

echo "✅ Kovan: tüm testler geçti"
