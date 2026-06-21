# 🐕 Project Underdog

**Kovan Zekası ile Topluluk Destekli, Merkeziyetsiz AI Geliştirme Sistemi**

Devasa donanım ve bütçelere sahip olmadan, açık kaynaklı yapay zeka modellerini en üst seviyeye çıkarmayı hedefleyen merkeziyetsiz ve kolektif bir yapay zeka geliştirme aracı.

> *"Birlikte öğrenen, birlikte güçlenir."* – Kovan Zekası Manifestosu

---

## Mimari

```
┌─────────────────────────────────────────────────────┐
│  ORKESTRATÖR: Qualixar OS                          │
│  - Judge pipeline (mutabakat/consensus)            │
│  - Forge AI (görev dağıtımı)                       │
│  - Dashboard (izleme)                              │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  VBS AGENT: Hermes Agent                           │
│  - Self-improving learning loop                    │
│  - Batch trajectory generation (training data)     │
│  - Multi-platform (Telegram/Discord/CLI)           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  FEDERATED: Flower (SuperLink/SuperNode)           │
│  FINE-TUNING: SmolLM-135M + LoRA (CPU destekli)    │
│  TOKEN OPT.: tokenless + token-pilot               │
│  GÜVENLİK: Validator + İtibar + Honeypot          │
└─────────────────────────────────────────────────────┘
```

## Bileşenler

| Katman | Araç | Lisans |
| :--- | :--- | :--- |
| Orkestratör | [Qualixar OS](https://github.com/qualixar/qualixar-os) | FSL-1.1-ALv2 |
| VBS Ajan | [Hermes Agent](https://github.com/NousResearch/hermes-agent) | MIT |
| Federated | [Flower](https://github.com/flwrlabs/flower) | Apache 2.0 |
| Fine-Tuning | SmolLM + LoRA (TRL/PEFT) | Apache 2.0 |
| Token Opt. | [tokenless](https://github.com/TokenFleet-AI/tokenless) | Apache 2.0 |
| Güvenlik | Özel (Validator + Reputation + Honeypot) | MIT |

## Hızlı Başlangıç

```bash
# 1. Orkestratörü başlat
cd core/qualixar-os-main
npm install && npm run build
node bin/qos.js serve --dashboard --port 3000

# 2. Hermes Agent'ı çalıştır
hermes -z "Merhaba Dünya"

# 3. Fine-tuning başlat
python3.11 core/fine_tune.py --model HuggingFaceTB/SmolLM2-135M-Instruct --max_steps 100

# 4. Güvenlik testlerini çalıştır
python3 tests/test_security.py
```

## Gereksinimler

- Python 3.11+ (fine-tuning)
- Node.js 22+ (Qualixar OS)
- Rust 1.89+ (tokenless)
- 2GB+ RAM (CPU-only çalışır)

## Lisans

MIT — [proje.md](proje.md)
