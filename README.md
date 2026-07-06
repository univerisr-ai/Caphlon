# ⚡ Caphlon

**Unified AI Agent Platform** — Qualixar OS + Open Design + MiMo Code.

Kovan Zekası ile topluluk destekli, merkeziyetsiz AI geliştirme sistemi. Devasa donanım ve bütçelere sahip olmadan, açık kaynaklı yapay zeka modellerini en üst seviyeye çıkarmayı hedefleyen kolektif bir platform.

> *"Birlikte öğrenen, birlikte güçlenir."* – Kovan Zekası Manifestosu

![Caphlon TUI — deniz/ahtapot temalı arayüz](docs/images/caphlon-tui.png)

> Arayüz turu (karşılama ekranı + model seçici) için: [docs/UI.md](docs/UI.md)

---

## Başla

> Not: Paket henüz npm'de yayınlanmadı; kurulum kaynaktan yapılır. Vendored
> araçlar (`core/*`) pakete girmediği için `npx caphlon` tarzı global kurulum
> bugün desteklenmiyor.

```bash
git clone https://github.com/univerisr-ai/Caphlon.git && cd Caphlon
bash scripts/setup-cores.sh        # CLI build + Qualixar + Aider/LiteLLM + Hermes (idempotent)
node packages/caphlon/bin/caphlon.js doctor

# İsteğe bağlı: her yerden `caphlon` / `caph` demek için
cd packages/caphlon && npm link
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

| Katman | Araç | Durum | Lisans | Doküman |
| :--- | :--- | :--- | :--- | :--- |
| CLI | [Caphlon](packages/caphlon/) | **Çekirdek** | MIT | [README](packages/caphlon/README.md) |
| Arayüz (TUI) | [OpenCode](https://github.com/sst/opencode) (entegre) | **Çekirdek** | MIT | [docs/integration/BEST_OF_BREED.md](docs/integration/BEST_OF_BREED.md) |
| Pair-Programming | [Aider](https://github.com/Aider-AI/aider) (entegre) | **Çekirdek** | Apache 2.0 | [docs/integration/BEST_OF_BREED.md](docs/integration/BEST_OF_BREED.md) |
| Orkestratör | [Qualixar OS](https://github.com/qualixar/qualixar-os) | Koşullu | FSL-1.1-ALv2 | — |
| Design/UI Pipeline | [Open Design](https://github.com/nexu-io/open-design) (entegre) | Koşullu | Apache 2.0 | [docs/integration/OPEN_DESIGN_INTEGRATION.md](docs/integration/OPEN_DESIGN_INTEGRATION.md) |
| Memory/Workflow | [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) (entegre) | Koşullu | MIT | [docs/integration/MIMO_CODE_INTEGRATION.md](docs/integration/MIMO_CODE_INTEGRATION.md) |
| Güvenlik | Özel (Validator + Reputation + Honeypot) | Koşullu | MIT | — |
| VBS Ajan | [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Deneysel | MIT | — |
| Federated | [Flower](https://github.com/flwrlabs/flower) | Deneysel | Apache 2.0 | — |
| Fine-Tuning | SmolLM + LoRA (TRL/PEFT) | Deneysel | Apache 2.0 | — |
| Token Opt. | [tokenless](https://github.com/TokenFleet-AI/tokenless) | Deneysel | Apache 2.0 | — |

### Çekirdek / Koşullu / Deneysel — dürüst etiketleme

- **Çekirdek** — günlük değerin geldiği yer: OpenCode TUI, Aider ve Caphlon'un
  kendi fikirleri (`connect` tek-anahtar dağıtımı, skill katmanı + kör
  doğrulama, doctor/status). Bunlarsız Caphlon'un varlık sebebi kalmaz.
- **Koşullu** — o iş akışını gerçekten kullanıyorsan değerli: tasarım işi
  yapıyorsan Open Design, çoklu-ajan koşturuyorsan Qualixar, MEMORY.md/compose
  desenlerini kullanıyorsan MiMo. Kullanmıyorsan sadece disk ağırlığı.
- **Deneysel** — bağlı ve çalışır durumda, ama uçtan uca değer ürettiği henüz
  HİÇ kanıtlanmadı: Hermes→Flower federated eğitim hattı hiç koşulmadı,
  tokenless'ın kullanılan yüzeyi dar, Kovan'ın çok-makine federasyonu tek
  makinede spekülatif. "Çalışıyor" ile "gerekli" ayrı şeylerdir.

> **Kural:** Deneysel bir parçaya birkaç haftalık gerçek kullanımda bir kez
> bile dokunulmadıysa, kopyası kalır ama zihinsel yükten (doctor beklentisi,
> kurulum adımı, doküman önceliği) çıkarılır. Terfi/emeklilik kararını masa
> başı tartışması değil, kullanım verir.

## Gereksinimler

- Node.js **22 LTS** — Caphlon CLI 22+ ile çalışır, ama Qualixar OS özellikle
  22 ister: 24+ native `better-sqlite3` derlemesini kırar (setup-cores.sh
  uyumlu Node 22'yi brew/nvm'den kendisi arar)
- Python 3.11+ (fine-tuning)
- Rust 1.89+ (tokenless)
- 2GB+ RAM (CPU-only çalışır)
