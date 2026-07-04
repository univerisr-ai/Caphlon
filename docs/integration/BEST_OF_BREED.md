# Best-of-Breed — Tek Uygulamada Birleşik Yetenekler

> **İlke:** Caphlon hiçbir aracı sıfırdan yazmaz. Her açık kaynak projeyi
> `core/` ve kök altına **gerçek haliyle** indirir, sadece "en iyi yanını"
> alıp tek bir CLI'nin arkasına bağlar (wire eder). Caphlon = ince orkestrasyon
> katmanı; iş yapan kod indirilen projelerin kendisidir.

---

## Hangi araçtan ne alıyoruz → nereye bağlı

| Araç (gerçek kod) | Aldığımız en iyi yan | Caphlon girişi | Nasıl çağrılır (wiring) |
|---|---|---|---|
| **OpenCode** (`core/opencode-main`) | Terminal arayüzü (TUI) — birebir | `caphlon ui` / `caphlon tui` | `commands/ui.ts` → gerçek `opencode` TUI'sini başlatır, bağlı modeli `--model provider/model` ile geçirir |
| **Aider** (`core/aider-main`) | Git-farkındalıklı AI çift-programlama, doğrudan dosya editleme | `caphlon code` | `commands/code.ts` → gerçek `aider` / `python -m aider` spawn eder, bağlı modeli `--model` ile geçirir |
| **Qualixar OS** (`core/qualixar-os-main`) | Çoklu-ajan orkestrasyon, Judge pipeline, dashboard | `caphlon dev`, `caphlon run` | `qos-bridge.ts` → `bin/qos.js serve` alt süreci |
| **MiMo Code** (`MiMo-Code-main`) | Kalıcı hafıza (MEMORY.md), Compose workflow, Dream/Distill | `caphlon compose`, `caphlon init` | compose topolojisi + MEMORY.md şablonu |
| **Open Design** (`open-design-main`) | 100+ tasarım skill'i, marka sistemleri, HTML→MP4 | `caphlon design` | `od` daemon (port 7456) / MCP köprüsü |
| **Hermes Agent** (`core/hermes-agent-main`) | Kendi kendine öğrenme, batch trajectory üretimi | (eğitim hattı) | `core/hermes_flower_bridge.py` → `hermes` CLI |
| **Flower** (`core/flower-main`) | Federated learning (SuperLink/SuperNode) | (eğitim hattı) | Hermes'ten gelen veriyle federated client |
| **tokenless** (`core/tokenless-main`) | Token sıkıştırma / maliyet optimizasyonu | `caphlon tokenless` | `commands/tokenless.ts` → gerçek `tokenless` binary'sini spawn eder |

---

## Ortak omurga: `/connect` model bağlama (OpenCode tarzı)

Tüm bu araçlar bir LLM'e ihtiyaç duyar. Caphlon, modeli **tek yerden** bağlar
ve hepsine dağıtır — her araca ayrı ayrı API key girmen gerekmez:

```bash
caphlon connect                       # sihirbaz: sağlayıcı → API key → model
caphlon connect anthropic --key sk-ant-... --model claude-opus-4-8
caphlon model                         # aktif modeli göster
caphlon model list                    # tüm sağlayıcı/modeller + durum
caphlon model use openai/gpt-4o       # aktif modeli değiştir
caphlon disconnect openai             # anahtarı sil
```

- **Şifreli saklama:** API key'ler `~/.caphlon/credentials.enc` içinde
  AES-256-GCM ile, makineye bağlı (hostname + install-id) anahtarla şifrelenir.
  Düz metin hiçbir yere yazılmaz (`config/store.ts`).
- **Otomatik dağıtım:** `config/active.ts` aktif modeli ortam değişkenlerine
  enjekte eder (`ANTHROPIC_API_KEY`, `UNDERDOG_LLM_*`, vb.) → Qualixar OS,
  Aider ve Python orkestratör hiçbir ek ayar olmadan aynı modeli kullanır.

Bu, "en iyi yanları tek uygulama" vizyonunun çalışan çekirdeğidir: bir kez
bağlan, her bileşen aynı modelle çalışsın.
