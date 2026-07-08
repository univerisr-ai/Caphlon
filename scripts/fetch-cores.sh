#!/usr/bin/env bash
# =============================================================================
# Caphlon — vendored araçları upstream'den indir (idempotent)
#
# No-rewrite ilkesinin lojistiği: Caphlon araçları taklit etmez, GERÇEK
# kopyalarını indirir. Bu script her aracı GitHub arşivinden (varsayılan dal)
# tar.gz olarak çeker ve mevcut dizin düzeniyle birebir (<repo>-main/) açar.
# Var olan dizine ASLA dokunmaz — güncelleme istiyorsan dizini silip yeniden
# çalıştır (yerel yamalar apply-patches.sh ile geri uygulanır).
#
# Varsayılan küme: Çekirdek + Koşullu (README Bileşenler tablosu).
# --all: Deneysel katman (hermes/flower/tokenless) dahil.
#
# Kullanım:  bash scripts/fetch-cores.sh [--all]
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf "\033[36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[33m! %s\033[0m\n" "$1"; }

# fetch <hedef-dizin> <github-owner/repo>
# archive/HEAD.tar.gz varsayılan dalı verir (main/master farketmez); arşivin
# içindeki tek üst dizin adı ne olursa olsun hedefe taşınır.
fetch() {
  local dest=$1 src=$2
  if [ -d "$dest" ]; then
    ok "$dest zaten var (atlandı)"
    return 0
  fi
  say "indiriliyor: github.com/$src → $dest"
  local tmp
  tmp="$(mktemp -d)"
  if ! curl -fsSL "https://github.com/$src/archive/HEAD.tar.gz" | tar -xz -C "$tmp"; then
    rm -rf "$tmp"
    warn "$src indirilemedi (ağ/repo?) — bu araç atlandı; doctor eksik gösterecek."
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  mv "$tmp"/* "$dest"
  rm -rf "$tmp"
  ok "$dest hazır"
}

WITH_ALL=0
[ "${1:-}" = "--all" ] && WITH_ALL=1

# --- Çekirdek ------------------------------------------------------------
fetch core/opencode-main      sst/opencode
fetch core/aider-main         Aider-AI/aider

# --- Koşullu -------------------------------------------------------------
fetch core/qualixar-os-main   qualixar/qualixar-os
fetch MiMo-Code-main          XiaomiMiMo/MiMo-Code
fetch open-design-main        nexu-io/open-design

# --- Deneysel (yalnız --all) ----------------------------------------------
if [ "$WITH_ALL" = 1 ]; then
  fetch core/hermes-agent-main  NousResearch/hermes-agent
  fetch core/flower-main        flwrlabs/flower
  fetch core/tokenless-main     TokenFleet-AI/tokenless
else
  say "Deneysel katman atlandı (hermes/flower/tokenless) — istersen: bash scripts/fetch-cores.sh --all"
fi

echo
say "Yerel yamalar uygulanıyor (packages/caphlon/patches/*)"
bash "$ROOT/scripts/apply-patches.sh" || warn "Bazı yamalar uygulanamadı — upstream ilerlemiş olabilir; yukarıdaki uyarılara bakın."
