#!/usr/bin/env bash
# =============================================================================
# Caphlon — indirilen araçlara yerel yamaları uygula (idempotent)
#
# core/qualixar-os-main, core/opencode-main gibi indirilen araçlar .gitignore
# ile hariç tutulur (kendi git geçmişleri yok) — bu yüzden onların İÇİNE
# yapılan hiçbir düzeltme normalde kalıcı değildir (yeniden klonlanınca
# sessizce kaybolur). packages/caphlon/patches/<araç-dizini>/*.patch altında
# saklanan yamalar, o aracın gerçek kaynağına (kurulum sonrası) burada
# otomatik uygulanır. `git diff` formatında, `-p1` ile üretilir/uygulanır.
#
# Kullanım:  bash scripts/apply-patches.sh   (setup-cores.sh çağırır)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH_ROOT="$ROOT/packages/caphlon/patches"

say()  { printf "\033[36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[33m! %s\033[0m\n" "$1"; }

[ -d "$PATCH_ROOT" ] || exit 0

for tool_dir in "$PATCH_ROOT"/*/; do
  [ -d "$tool_dir" ] || continue
  name="$(basename "$tool_dir")"

  # Araç ya core/<name> altında ya da repo kökünde <name> olarak durur.
  target=""
  for candidate in "$ROOT/core/$name" "$ROOT/$name"; do
    [ -d "$candidate" ] && target="$candidate" && break
  done
  if [ -z "$target" ]; then
    warn "$name bulunamadı (core/$name veya $name) — yamalar atlandı"
    continue
  fi

  for patch in "$tool_dir"*.patch; do
    [ -f "$patch" ] || continue
    patch_name="$(basename "$patch")"
    if ( cd "$target" && patch -p1 -N --dry-run --silent < "$patch" ) >/dev/null 2>&1; then
      ( cd "$target" && patch -p1 -N --silent < "$patch" )
      ok "$name: $patch_name uygulandı"
    else
      say "$name: $patch_name zaten uygulanmış — atlandı"
    fi
  done
done
