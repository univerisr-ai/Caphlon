# Open Design — Qualixar OS Entegrasyonu

> **Kaynak:** [nexu-io/open-design](https://github.com/nexu-io/open-design) (Apache 2.0)
> **Sürüm:** 0.10.0
> **Entegrasyon Tarihi:** 2026-06-24

---

## Nedir?

**Open Design**, Anthropic'in Claude Design'ına açık kaynak alternatiftir. Local-first,
agent-native bir design workspace. Qualixar OS'a UI/UX tasarımı, görsel üretim,
marka yönetimi ve creative output yetenekleri kazandırır.

### Neden Entegre Edildi?

Qualixar OS mükemmel bir agent orkestratörü — 13 topoloji, Forge AI, Judge pipeline,
MCP/A2A protokolleri, 24 tab'lı dashboard. Ancak **tasarım ve görsel üretim** yeteneği
yoktu. Open Design bu boşluğu doldurur:

| Qualixar OS'ta Eksik Olan | Open Design ile Gelen |
|---|---|
| UI/UX prototipleme | 100+ skill ile web/mobil/desktop prototipleri |
| Brand design system yönetimi | 150 brand-grade DESIGN.md sistemi |
| Görsel/image üretimi | 93 hazır prompt template + multi-model destek |
| Sunum/deck oluşturma | 15 deck template × 36 tema |
| Video/motion grafik | HyperFrames (HTML → MP4) |
| Plugin ekosistemi | 261 plugin (scenario, template, atom) |
| Design critique | 5-boyutlu self-critique |
| Figma/Pencil → Code migration | Özel migration plugin'leri |

---

## Open Design'ın Güzel Yanları

### 1. Agent-Native Mimarisi
Open Design bir agent değildir — mevcut coding agent'larınızı (Claude Code, Codex,
OpenCode, Cursor, Hermes, vs.) design engine olarak kullanır. 22+ CLI'ye MCP ile
bağlanır. Qualixar OS'un MCP desteği sayesinde sorunsuz entegre olur.

### 2. 150+ Brand-Grade Design Sistemi
Her biri tek bir `DESIGN.md` dosyasından oluşan, 9 bölümlük şema:
- Renk paleti, tipografi, spacing, layout
- Component, motion, voice, brand, anti-patterns
- Linear, Stripe, Vercel, Apple, Notion, Cursor, Supabase, Airbnb, Tesla...

Agent'iniz "Linear design sistemiyle bir landing page yap" dediğinizde, 9 bölümü
de okur ve brand-grade çıktı üretir.

### 3. 100+ Skill
Her skill bir `SKILL.md` dosyasıdır. Kategoriler:
- **prototype:** web, mobile, desktop, dashboard, saas-landing, email...
- **deck:** magazine, swiss, pitch, 15 template × 36 theme
- **image:** editorial, cinematic, product, portrait — multi-model
- **video:** HyperFrames + Seedance + Veo + Sora
- **utility:** critique, tweaks, pm-spec, eng-runbook

### 4. HyperFrames — HTML → MP4
Open Design, HeyGen'in HyperFrames framework'ünü birinci sınıf vatandaş olarak
entegre eder. Agent HTML + CSS + GSAP yazar, headless Chrome + FFmpeg ile MP4'e
dönüşür. SaaS promo, TikTok, brand sizzle, data viz, flight map — 11 template.

### 5. 261 Plugin
Portable agent-skill folder'ları. Her plugin:
- Bir `SKILL.md` (agent'ın okuyabildiği)
- Bir `open-design.json` (marketplace metadata)
- Preview, inputs, pipeline, capability declarations

Kategoriler: scenarios (11), image-templates (45), video-templates (50),
design-systems (142), atoms (13), examples (140)

### 6. BYOK Proxy
SSRF-korumalı proxy ile herhangi bir OpenAI-compatible endpoint'e bağlanır.
Multi-provider desteği: OpenAI, Anthropic, Azure, Google, Ollama, vLLM...

### 7. Local-First, Privacy by Conviction
Her şey local'de çalışır. Desktop uygulaması (macOS/Windows) + daemon + CLI.
Telemetry yok, cloud round-trip yok. Qualixar OS'un zero-cloud felsefesiyle
birebir uyumlu.

---

## Entegrasyon Detayları

### Yapı

```
qualixar-os-main/src/design/
├── index.ts          ← Open Design bridge (tool definitions + API köprüsü)
└── mimo-bridge.ts    ← MiMo Code bridge (memory + compose + dream/distill)
```

### Kayıtlı Araçlar

| Araç Adı | Açıklama | Kategori |
|---|---|---|
| `design_prototype` | Web/mobil/desktop prototipi | creative |
| `design_deck` | Sunum/deck oluşturma | creative |
| `design_image` | Brand-grade görsel | creative |
| `design_hyperframe` | HTML→MP4 motion grafik | creative |
| `design_plugin` | Plugin marketplace | creative |
| `design_system_list` | 150+ design sistemi listele | creative |
| `design_critique` | 5-boyutlu self-critique | creative |
| `mimo_memory_init` | MEMORY.md başlatma | code-dev |
| `mimo_checkpoint` | Oturum checkpoint | code-dev |

### Forge AI Entegrasyonu

Forge AI, "creative" task tipinde Open Design araçlarını otomatik seçer:

```
Task: "Bir landing page tasarla, Linear design sistemini kullan"
→ Forge: design_prototype + design_system_list seçer
→ Agents: Open Design MCP üzerinden prototip üretir
→ Judge: Çıktıyı değerlendirir
```

### Kullanım

```bash
# Open Design kurulumu
curl -fsSL https://open-design.ai/install.sh | sh

# Open Design daemon'ı başlat
od daemon start

# Qualixar OS ile kullan
qos run "Bir landing page tasarla, Linear design sistemiyle" --type creative
```

### Forge AI için Yeni Task Tipleri

```bash
# Prototip tasarımı
qos run "SaaS landing page tasarla" --type design-prototype

# Sunum hazırlama
qos run "Q3 roadmap sunumu hazırla, Stripe tasarımıyla" --type design-deck

# Görsel üretimi
qos run "Hero image üret, editorial tarzda" --type design-image

# Video
qos run "30sn ürün promo videosu" --type design-video

# Design critique
qos run "Bu tasarımı değerlendir" --type design-critique
```

---

## Projeye Kattıkları

| Yetenek | Öncesi | Sonrası |
|---|---|---|
| UI/UX tasarımı | Yok | 100+ skill, 150 design system |
| Görsel üretim | Yok | 93 prompt template, multi-model |
| Sunum/deck | Yok | 15 template × 36 tema, PPTX/PDF export |
| Video/motion | Yok | HyperFrames HTML→MP4 |
| Design system yönetimi | Yok | 150 brand-grade sistem |
| Plugin ekosistemi | Sadece skill store | 261 plugin + marketplace |
| Design critique | Yok | 5-boyutlu self-critique |
| Figma/Pencil → Code | Yok | Migration plugin'leri |
