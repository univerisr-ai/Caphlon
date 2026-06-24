# ⚡ Caphlon

**Unified AI Agent Platform** — Qualixar OS + Open Design + MiMo Code.

Kovan Zekası ile topluluk destekli, merkeziyetsiz AI geliştirme sistemi. Devasa donanım ve bütçelere sahip olmadan, açık kaynaklı yapay zeka modellerini en üst seviyeye çıkarmayı hedefleyen kolektif bir platform.

> *"Birlikte öğrenen, birlikte güçlenir."* – Kovan Zekası Manifestosu

---

## Tek Komutla Başla

```bash
npx caphlon
# veya
npm install -g caphlon && caph dev
```

## Mimari

```
┌──────────────────────────────────────────────────────────────────┐
│  CAPHLON CLI (caphlon/caph)                                     │
│  Tek komut — tüm bileşenlere erişim                             │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  ORKESTRATÖR: Qualixar OS                                      │
│  - Judge pipeline (mutabakat/consensus)                        │
│  - Forge AI (görev dağıtımı + compose workflow)                │
│  - Dashboard (24 tab)                                          │
│  - OPEN DESIGN BRIDGE (tasarım/UI/creative pipeline)           │
│  - MIMO BRIDGE (memory + compose + self-improvement)           │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│  DESIGN KATMANI: Open Design                                    │
│  - 100+ skill (prototype, deck, image, video, dashboard)       │
│  - 150 brand-grade DESIGN.md sistemi (Linear, Stripe, Apple)    │
│  - 261 plugin (scenario, template, migration)                   │
│  - HyperFrames HTML→MP4 motion graphics                        │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│  MEMORY/WORKFLOW KATMANI: MiMo Code (fork of OpenCode)          │
│  - Persistent memory (MEMORY.md + SQLite FTS5)                  │
│  - Compose mode (specs-driven development)                      │
│  - Dream/Distill (self-improvement döngüsü)                     │
│  - Goal/Stop condition (judge ile premature stop önleme)        │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│  VBS AGENT: Hermes Agent                                        │
│  - Self-improving learning loop                                 │
│  - Batch trajectory generation (training data)                  │
│  - Multi-platform (Telegram/Discord/CLI)                        │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│  FEDERATED: Flower (SuperLink/SuperNode)                        │
│  FINE-TUNING: SmolLM-135M + LoRA (CPU destekli)                 │
│  TOKEN OPT.: tokenless + token-pilot                             │
│  GÜVENLİK: Validator + İtibar + Honeypot                        │
└──────────────────────────────────────────────────────────────────┘
```

## CLI Komutları

```bash
caphlon dev          # Agent + dashboard başlat
caphlon run "..."    # Task çalıştır
caphlon design       # Tasarım pipeline'ı
caphlon compose      # Compose workflow (8 aşama)
caphlon status       # Sistem durumu
caphlon doctor       # Tanılama
caphlon init         # Proje başlat
```

## Bileşenler

| Katman | Araç | Lisans | Doküman |
| :--- | :--- | :--- | :--- |
| CLI | [Caphlon](packages/caphlon/) | MIT | [README](packages/caphlon/README.md) |
| Orkestratör | [Qualixar OS](https://github.com/qualixar/qualixar-os) | FSL-1.1-ALv2 | — |
| Design/UI Pipeline | [Open Design](https://github.com/nexu-io/open-design) (entegre) | Apache 2.0 | [docs/integration/OPEN_DESIGN_INTEGRATION.md](docs/integration/OPEN_DESIGN_INTEGRATION.md) |
| Memory/Workflow | [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) (entegre) | MIT | [docs/integration/MIMO_CODE_INTEGRATION.md](docs/integration/MIMO_CODE_INTEGRATION.md) |
| VBS Ajan | [Hermes Agent](https://github.com/NousResearch/hermes-agent) | MIT | — |
| Federated | [Flower](https://github.com/flwrlabs/flower) | Apache 2.0 | — |
| Fine-Tuning | SmolLM + LoRA (TRL/PEFT) | Apache 2.0 | — |
| Token Opt. | [tokenless](https://github.com/TokenFleet-AI/tokenless) | Apache 2.0 | — |
| Güvenlik | Özel (Validator + Reputation + Honeypot) | MIT | — |

## Gereksinimler

- Node.js 22+ (Caphlon CLI, Qualixar OS)
- Python 3.11+ (fine-tuning)
- Rust 1.89+ (tokenless)
- 2GB+ RAM (CPU-only çalışır)

## Lisans

[LICENSE.md](LICENSE.md)
