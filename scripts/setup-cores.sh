#!/usr/bin/env bash
# =============================================================================
# Caphlon — JS/TS çekirdek kurulumu (idempotent)
#
# `caphlon run`/`caphlon dev` oto-başlatmasının çalışması için Caphlon CLI ve
# Qualixar OS orkestratörünün KURULU + DERLENMİŞ olması gerekir. Bu script onu
# garanti eder. Tekrar çalıştırmak güvenlidir (var olanı atlamaz, günceller).
#
# Kullanım:  bash scripts/setup-cores.sh   (veya: make setup-cores)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf "\033[36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[33m! %s\033[0m\n" "$1"; }

# --- 1. Caphlon CLI ----------------------------------------------------------
say "Caphlon CLI (packages/caphlon) — install + build"
( cd packages/caphlon && npm install --no-audit --no-fund && npm run build )
ok  "Caphlon CLI hazır"

# --- 2. Qualixar OS orkestratörü --------------------------------------------
QOS=""
for d in "core/qualixar-os-main" "qualixar-os-main"; do
  [ -f "$d/bin/qos.js" ] && QOS="$d" && break
done

# Qualixar OS native better-sqlite3'e bağlı; Node 24+ ile kaynaktan derlenmesi
# kırılır. Uyumlu bir Node 22 (brew/nvm) varsa SADECE qos adımı için onu kullan.
qos_node_path() {
  local cur; cur="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$cur" -lt 24 ] 2>/dev/null; then return 0; fi  # mevcut node zaten uygun
  for c in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin \
           "$HOME"/.nvm/versions/node/v22*/bin; do
    if [ -x "$c/node" ]; then echo "$c"; return 0; fi
  done
  return 0
}

if [ -z "$QOS" ]; then
  warn "Qualixar OS bulunamadı (core/qualixar-os-main). Orkestratör kurulumu atlandı."
else
  say "Qualixar OS ($QOS) — install + build"
  QNODE_BIN="$(qos_node_path)"
  QPATH="$PATH"
  if [ -n "$QNODE_BIN" ]; then
    QPATH="$QNODE_BIN:$PATH"
    say "qos adımı için Node 22 kullanılıyor: $QNODE_BIN"
  else
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$NODE_MAJOR" -ge 24 ] 2>/dev/null; then
      warn "Node $NODE_MAJOR algılandı, uyumlu Node 22 bulunamadı."
      warn "Öneri: brew install node@22  (veya nvm install 22), sonra tekrar çalıştır."
    fi
  fi
  # Bir core'un başarısızlığı tüm kurulumu çökertmesin — uyar, devam et.
  if ( cd "$QOS" && PATH="$QPATH" npm install --no-audit --no-fund ); then
    # Asıl kritik çıktı dist/channels/cli.js (serve yolu). Tam build (dashboard
    # dahil) başarısız olursa en azından TS'i derleyip CLI'ı çalışır bırak.
    if ( cd "$QOS" && PATH="$QPATH" npm run build ); then
      ok "Qualixar OS tam derlendi (dashboard dahil)"
    elif ( cd "$QOS" && PATH="$QPATH" npx --yes tsc -p tsconfig.json ); then
      warn "Dashboard build atlandı; CLI/serve derlendi (dist/ hazır)"
    else
      warn "Qualixar OS derlenemedi — 'cd $QOS && npm run build' çıktısına bakın"
    fi
  else
    warn "Qualixar OS bağımlılıkları kurulamadı (muhtemelen native better-sqlite3 + Node $NODE_MAJOR)."
    warn "Çözüm: Node 22 LTS'e geç (nvm use 22) ve 'make setup-cores' tekrar çalıştır."
  fi
fi

# --- 3. Aider + LiteLLM (bundled kopya → izole venv) --------------------------
# caphlon code (aider), caphlon serve (litellm proxy) ve tek-atış LLM çağrısı
# (src/llm.ts) bu venv'i bekler — llm.ts'in "make setup-cores" ipucunun doğru
# olmasını bu adım sağlar. Python ≥3.10 yoksa uyarır ve devam eder.
AIDER_SRC=""
for d in "core/aider-main" "aider-main"; do
  [ -f "$d/pyproject.toml" ] && AIDER_SRC="$d" && break
done
if core/aider-venv/bin/python -c 'import aider.main, litellm' >/dev/null 2>&1 \
   && [ -x core/aider-venv/bin/litellm ]; then
  ok "Aider+LiteLLM venv zaten hazır (core/aider-venv)"
elif [ -n "$AIDER_SRC" ]; then
  APY=""
  for c in python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.13 python3; do
    if command -v "$c" >/dev/null 2>&1 && \
       "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
      APY="$c"; break
    fi
  done
  if [ -n "$APY" ]; then
    say "Aider ($AIDER_SRC) + litellm[proxy] — izole venv (core/aider-venv, $APY)"
    if { [ -x core/aider-venv/bin/python ] || "$APY" -m venv core/aider-venv; } \
       && core/aider-venv/bin/pip install --quiet --upgrade pip \
       && core/aider-venv/bin/pip install --quiet -e "$AIDER_SRC" "litellm[proxy]"; then
      ok "Aider+LiteLLM hazır (core/aider-venv)"
    else
      warn "Aider venv kurulamadı — elle dene: core/aider-venv/bin/pip install -e $AIDER_SRC 'litellm[proxy]'"
    fi
  else
    warn "Python ≥3.10 yok; Aider/LiteLLM venv atlandı."
  fi
fi

# --- 4. Hermes Agent (bundled kopya → izole venv) -----------------------------
# Kopyalanan core/hermes-agent-main'i çalıştırılabilir yapar (aider-venv
# deseni). Hermes opsiyoneldir: uygun Python yoksa uyarır ve devam eder.
HERMES_SRC=""
for d in "core/hermes-agent-main" "hermes-agent-main"; do
  [ -f "$d/pyproject.toml" ] && HERMES_SRC="$d" && break
done
if [ -x core/hermes-venv/bin/hermes ]; then
  ok "Hermes venv zaten hazır (core/hermes-venv)"
elif [ -n "$HERMES_SRC" ]; then
  # pyproject requires-python = ">=3.11,<3.14"
  HPY=""
  for c in python3.13 python3.12 python3.11 /opt/homebrew/bin/python3.13 python3; do
    if command -v "$c" >/dev/null 2>&1 && \
       "$c" -c 'import sys; sys.exit(0 if (3,11) <= sys.version_info < (3,14) else 1)' 2>/dev/null; then
      HPY="$c"; break
    fi
  done
  if [ -n "$HPY" ]; then
    say "Hermes Agent ($HERMES_SRC) — izole venv (core/hermes-venv, $HPY)"
    if "$HPY" -m venv core/hermes-venv \
       && core/hermes-venv/bin/pip install --quiet --upgrade pip \
       && core/hermes-venv/bin/pip install --quiet -e "$HERMES_SRC"; then
      ok "Hermes hazır (core/hermes-venv/bin/hermes)"
    else
      warn "Hermes venv kurulamadı — elle dene: core/hermes-venv/bin/pip install -e $HERMES_SRC"
    fi
  else
    warn "Python 3.11–3.13 yok; Hermes venv atlandı (opsiyonel)."
  fi
fi

echo
say "Yerel yamalar (packages/caphlon/patches/*) uygulanıyor"
# Tutmayan yama kurulumu kesmesin ama sesli kalsın (script kendisi uyarır).
bash "$ROOT/scripts/apply-patches.sh" || warn "Bazı yamalar uygulanamadı — yukarıdaki uyarılara bakın."

echo
say "Doğrulama: caphlon doctor"
node packages/caphlon/bin/caphlon.js doctor || true
