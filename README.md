# ⚡ Caphlon

**Unified AI Agent Platform** — Qualixar OS + Open Design + MiMo Code.

Kovan Zekası ile topluluk destekli, merkeziyetsiz AI geliştirme sistemi. Devasa donanım ve bütçelere sahip olmadan, açık kaynaklı yapay zeka modellerini en üst seviyeye çıkarmayı hedefleyen kolektif bir platform.

> *"Birlikte öğrenen, birlikte güçlenir."* – Kovan Zekası Manifestosu

![Caphlon TUI — deniz/ahtapot temalı arayüz](docs/images/caphlon-tui.png)

> Arayüz turu (karşılama ekranı + model seçici) için: [docs/UI.md](docs/UI.md)

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
caphlon connect      # Model sağlayıcısı + API key bağla (OpenCode tarzı)
caphlon model        # Aktif modeli göster / listele / değiştir
caphlon ui           # OpenCode arayüzünü başlat (birebir OpenCode TUI)
caphlon code         # AI çift-programlama (gerçek Aider ile)
caphlon dev          # Agent + dashboard başlat
caphlon run "..."    # Task çalıştır
caphlon design       # Tasarım pipeline'ı
caphlon compose      # Compose workflow (8 aşama)
caphlon skill        # Skill deposu: list/add/search/show/learn/evolve/sync
caphlon status       # Sistem durumu
caphlon doctor       # Tanılama
caphlon init         # Proje başlat
```

> Tüm bileşenler tek modele bağlanır: `caphlon connect` ile bir kez bağla,
> Qualixar OS / Aider / orkestratör aynı modeli kullansın. Detay:
> [docs/integration/BEST_OF_BREED.md](docs/integration/BEST_OF_BREED.md)

## 🐝 Kovan Zekası — kaç kişi kullanırsa o kadar güçlü

Zayıf donanım (2GB RAM / i5 3. nesil) ve zayıf model ile, **kalabalık +
konsensüs + ortak hafıza** sayesinde güçlü-model kalitesine yaklaş. Para değil,
katılım. Detay: [docs/HIVE.md](docs/HIVE.md)

```bash
# Tek makinede, bugün — bağlı modeli N kez örnekle, konsensüsle güçlendir
caphlon hive solve "Bu fonksiyonun hatası ne?" --samples 5

# Kanıt: çok düğüm → güç (simülasyon)
caphlon hive demo

# Swarm kur (binlerce kullanıcı senaryosu)
caphlon hive serve                         # koordinatör (ya da: docker compose up -d hive)
caphlon hive join --id n1                  # her kullanıcı kendi düğümüyle katılır (n1, n2, ...)
caphlon hive ask "2+2 kactir?"             # kovan konsensüs cevabı

# Biriken güç: lokal LoRA katkısı gönder / güncel ortak adapter'ı indir
caphlon hive submit-delta --id n1 --delta delta.json
caphlon hive pull --out adapter.json
```

Güç katmanları: **öz-topluluk** (tek kullanıcı, anında) · **swarm konsensüs**
(çok kullanıcı, anında) · **ortak çözüm önbelleği** (N kullanıcı = N× hafıza) ·
**federated LoRA** (biriken). Güvenlik: validator + itibar + honeypot + anomali
eleme. Gizlilik: ham veri makineden çıkmaz, yalnızca ağırlık farkı paylaşılır.

**Living Marketplace — öğrenilen dersler paylaşılır:** `caphlon skill evolve`
bir görev izinden (trace) aday bir skill çıkarır → **bağımsız** bir judge
onaylar → onaylanan ders `learned/`e yazılır. `caphlon skill sync push
<owner/repo>` bu dersleri bir git reposuna gönderir; başka bir kullanıcı
`caphlon skill sync pull` ile onaysız hiçbir şey çalıştırmadan aynı dersleri
çeker (git shell-out — kendi dağıtım protokolümüz yok). Yayın her zaman ayrı
bir insan onayı gerektirir; `--yes` bile otomatik push yapmaz.

### ⚖️ Dürüst değerlendirme — gerçek ölçümler

Bu projenin iddiaları **gerçek modellerle ölçüldü** (pazarlama değil, ölçü):

| Senaryo | SOLO | HIVE | Δ | Neden |
|---|---|---|---|---|
| Güçlü model (deepseek-v4-flash, 12 zor görev) | %100 | %100 | **0** | tavan — kaldıracak boşluk yok |
| Zayıf model (qwen 0.5b, self-ensemble) | %50 | %50 | **0** | hatalar **korelasyonlu** (hep aynı yanlış) |

**Net bulgu:** Saf consensus, düğümler **aynı** modeli koşarsa fark yaratmaz —
çünkü tek bir modelin (ya da kopyalarının) hataları bağımsız değil, sistematiktir
(Condorcet jüri teoremi bağımsızlık ister). Gerçek katkı şunları gerektirir:

- **Model çeşitliliği** (farklı modeller → bağımsız hatalar → consensus düzeltir), ya da
- **Ortak hafıza** (cache: bir kez çözüleni herkes bedava alır — en sağlam kazanç), ya da
- **Federated** birikim (fail-safe + eval gate ile).

> Yani "binlerce **aynı** zayıf düğüm → güçlü model" tek başına çalışmaz; tezin
> doğru hâli **çeşitlilik + biriken hafıza**. Bu, tahminle değil **ölçümle**
> belgelenmiştir.

## Bileşenler

| Katman | Araç | Lisans | Doküman |
| :--- | :--- | :--- | :--- |
| CLI | [Caphlon](packages/caphlon/) | MIT | [README](packages/caphlon/README.md) |
| Orkestratör | [Qualixar OS](https://github.com/qualixar/qualixar-os) | FSL-1.1-ALv2 | — |
| Design/UI Pipeline | [Open Design](https://github.com/nexu-io/open-design) (entegre) | Apache 2.0 | [docs/integration/OPEN_DESIGN_INTEGRATION.md](docs/integration/OPEN_DESIGN_INTEGRATION.md) |
| Memory/Workflow | [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) (entegre) | MIT | [docs/integration/MIMO_CODE_INTEGRATION.md](docs/integration/MIMO_CODE_INTEGRATION.md) |
| Pair-Programming | [Aider](https://github.com/Aider-AI/aider) (entegre) | Apache 2.0 | [docs/integration/BEST_OF_BREED.md](docs/integration/BEST_OF_BREED.md) |
| Arayüz (TUI) | [OpenCode](https://github.com/sst/opencode) (entegre) | MIT | [docs/integration/BEST_OF_BREED.md](docs/integration/BEST_OF_BREED.md) |
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
