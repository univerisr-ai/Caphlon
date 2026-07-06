# Caphlon CLI

**Unified AI Agent Platform** — Qualixar OS + Open Design + MiMo Code + OpenCode.

```bash
# Henüz npm'de yayınlanmadı — kurulum kaynaktan (repo kökünde):
bash scripts/setup-cores.sh       # CLI build + çekirdek araçlar (idempotent)
cd packages/caphlon && npm link   # `caphlon` / `caph` PATH'e girer
```

## Quick Start

```bash
caphlon connect                  # LLM sağlayıcısı + API key bağla (tek sefer)
caphlon ui                       # OpenCode TUI — günlük sürücü
caphlon run "Todo REST API'si"   # Qualixar OS ile görev koştur
caphlon status                   # tek bakışta sistem durumu
```

## Commands

Tam ve güncel liste: `caphlon --help` (komut yüzeyi `src/index.ts`'te tanımlı).

| Command | Description |
|---------|-------------|
| `connect` / `disconnect` / `model` | LLM sağlayıcısı bağla, anahtar şifreli saklanır, tüm araçlara dağıtılır |
| `ui` (`tui`) | Gerçek OpenCode TUI'sini başlatır (bağlı modelle) |
| `code` | Aider — git-farkındalıklı çift-programlama |
| `max` | Kör doğrulama: adayları aktif model üretir, kazananı ayrı judge seçer |
| `skill` | Skill katmanı: add/list/evolve + `sync push/pull` (Living Marketplace) |
| `init` / `dev` / `run` | Proje başlat, ajan+dashboard, Qualixar ile görev |
| `design` | Open Design boru hattı (`design daemon start`, `design ui`) |
| `compose` | MiMo workflow (`compose start/list/resume`) |
| `serve` | LiteLLM proxy — bağlı modeli OpenAI-uyumlu endpoint olarak sun |
| `tools` | Harici ajan CLI'larına (Claude Code vb.) Caphlon'u bağla |
| `hive` | Kovan zekâsı: çok-örnekli konsensüs |
| `hermes` / `flower` / `tokenless` | Deneysel katman (bkz. kök README "Durum" sütunu) |
| `status` / `doctor` | Durum özeti / gerçek probe'larla tanılama (`doctor --fix`) |

## Aliases

- `caphlon` or `caph` — both work

## Architecture

```
caphlon → OpenCode (TUI) · Aider (pair-programming)
       → Qualixar OS (agent orchestration)
       → Open Design (design pipeline)
       → MiMo Code (memory + compose workflow)
```
