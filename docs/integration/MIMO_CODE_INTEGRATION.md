# MiMo Code — Qualixar OS Entegrasyonu

> **Kaynak:** [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) (MIT)
> **Entegrasyon Tarihi:** 2026-06-24

---

## Nedir?

**MiMo Code**, Xiaomi tarafından geliştirilen, OpenCode fork'u bir terminal-native
AI coding assistant. Qualixar OS'a gelişmiş memory yönetimi, compose workflow,
ve self-improvement döngüsü kazandırır.

### Neden Entegre Edildi?

Qualixar OS'un SLM-Lite memory sistemi var (4 katman, 3 peer-reviewed paper),
ancak pratik kullanımda MiMo'nun MEMORY.md + checkpoint pattern'i daha erişilebilir.
Ayrıca MiMo'nun Compose mode ve Dream/Distill özellikleri Qualixar'da olmayan
yetenekler:

| Qualixar OS'ta Eksik Olan | MiMo Code ile Gelen |
|---|---|
| Pratik persistent memory | MEMORY.md + checkpoint.md + notes.md |
| Specs-driven workflow | Compose mode (8 aşamalı) |
| Self-improvement | Dream (knowledge extraction) + Distill (skill extraction) |
| Premature stop önleme | Goal/Stop condition (judge model) |
| Voice input | /voice ile real-time ASR |
| Subagent orchestrasyonu | Background subagent lifecycle |

---

## MiMo Code'un Güzel Yanları

### 1. Persistent Memory Sistemi

SQLite FTS5 full-text search üzerine kurulu 4 bellek türü:

| Tür | Dosya | Amaç |
|---|---|---|
| Project Memory | `MEMORY.md` | Kalıcı proje bilgisi, kurallar, mimari kararlar |
| Session Checkpoint | `checkpoint.md` | Oturum durum snapshot'ı |
| Scratch Notes | `notes.md` | Geçici not alanı |
| Task Progress | `tasks/<id>/progress.md` | Task bazında log |

**Qualixar SLM-Lite ile ilişkisi:**
- SLM-Lite: 4 katmanlı cognitive memory (Episodic, Semantic, Procedural, Behavioral)
- MiMo: Markdown-tabanlı, insan tarafından okunabilir, git-friendly
- **Birlikte:** SLM-Lite vector store + MiMo markdown = hem güçlü hem okunabilir

### 2. Intelligent Context Management

- **Automatic checkpoints:** Context window dolduğunda otomatik checkpoint
- **Context reconstruction:** En son checkpoint + MEMORY.md + task progress'ten
  context rebuild
- **Budgeted injection:** Token bütçesine göre önem sıralı context ekleme

### 3. Compose Mode (Specs-Driven Development)

8 aşamalı workflow:

```
brainstorm → spec → implement → review → tdd → debug → verify → merge
```

Her aşamada doğru skill otomatik yüklenir. Agent'ın "acaba ne yapmalıyım?"
diye düşünmesine gerek kalmaz — yol bellidir.

**Qualixar Forge AI entegrasyonu:** Bu 8 adım, Forge AI'nın yeni bir "compose"
topolojisi olarak kullanılabilir.

### 4. Dream / Distill — Self-Improvement

**Dream (`/dream`):**
- Session trace'lerini tarar
- Tekrarlanan desenleri persistent knowledge'a çıkarır
- Eski/güncel olmayan bilgileri temizler
- MEMORY.md'yi otomatik günceller

**Distill (`/distill`):**
- Tekrarlanan manuel workflow'ları keşfeder
- Yüksek güvenilirlikli adayları skill/subagent/command'e dönüştürür
- **Qualixar SkillEvolver roadmap'ine doğrudan katkı**

### 5. Goal / Stop Condition

`/goal` command'i ile bir durma koşulu belirlenir. Agent durmak istediğinde,
independent bir judge model konuşmayı değerlendirir ve koşulun gerçekten
karşılanıp karşılanmadığına karar verir. Premature "optimistic stop"ları önler.

**Qualixar Judge pipeline entegrasyonu:** MiMo'nun goal judge'ı, Qualixar'ın
Judge pipeline'ı ile birleşerek daha güçlü bir quality gate oluşturur.

### 6. Subagent System

- Primary agent ihtiyaç duydukça subagent oluşturur
- Background execution + parallel çalışma
- Lifecycle tracking + cancellation
- Context paylaşımı

### 7. Voice Input

`/voice` ile real-time streaming voice input. TenVAD + MiMo ASR.
Ses otomatik bölünür, incremental transkribe edilir.

---

## Entegrasyon Detayları

### MEMORY.md Şablonu

Proje kökünde oluşturulan MEMORY.md, Qualixar SLM-Lite ile senkronize çalışır:

```markdown
# Project Memory

## Architecture Decisions
| # | Decision | Context | Date |
|---|----------|---------|------|

## Coding Rules
- ...

## Known Patterns
- ...

## Common Commands
- ...
```

### Compose Workflow — Forge AI Topolojisi

```yaml
topology: compose
steps:
  - brainstorm:   Gereksinim analizi + spesifikasyon
  - spec:         Teknik dokümantasyon
  - implement:    Kod yazma
  - review:       Code review
  - tdd:          Test-driven development
  - debug:        Hata ayıklama
  - verify:       Typecheck + test + lint
  - merge:        Birleştirme
```

### Dream/Distill → SkillEvolver

MiMo'nun self-improvement döngüsü, Qualixar roadmap'indeki SkillEvolver'ın
temelini oluşturur:

```
Dream/Distill (MiMo) → Knowledge extraction + skill discovery
                            ↓
SkillEvolver (Qualixar) → Automatic skill mutation + verification
                            ↓
Living Marketplace    → Evolved skills auto-publish
```

---

## Projeye Kattıkları

| Yetenek | Öncesi | Sonrası |
|---|---|---|
| Persistent memory | SLM-Lite (4 katman) | + MEMORY.md + checkpoint.md |
| Development workflow | Forge AI task design | + Compose mode (8 adım) |
| Self-improvement | SkillEvolver (roadmap) | Dream/Distill (şimdi) |
| Stop condition | Yok | Goal/Stop judge model |
| Voice input | Yok | /voice ASR |
| Context management | Statik | Budgeted injection + checkpoint/restore |

---

## Yarıda kesilirse ne olur? — Kesinti anatomisi (2026-07-08)

"8 adımın 3.sü ortada patlarsa baştan mı başlar?" sorusunun kod-düzeyinde cevabı.
İki ayrı kesinti türü var ve ikisi farklı işler:

### 1. Adım hatası (süreç yaşıyor, bir aşama başarısız)

MiMo'nun `workflow/builtin/compose.js` motoru **baştan başlamaz** — sınırlı,
bağlam-taşıyan retry yapar:

- **Implement/Verify döngüsü** en fazla 3 deneme (`MAX_TDD_ATTEMPTS`); başarısız
  verify'ın hata çıktısı bir SONRAKİ denemenin prompt'una aynen enjekte edilir
  ("Verify failures from previous attempt — focus on these") + araya ayrı bir
  debug ajanı girer. Brainstorm/design TEKRARLANMAZ.
- **Bağımsız görevler izole git worktree'lerinde** koşar — birinin çökmesi
  diğerlerinin işini bozamaz; entegrasyon ayrı adımdır ve yalnız gerçekten
  değişen worktree'leri birleştirir.
- **Review→Fix döngüsü** aynı desen, en fazla 2 deneme.
- Denemeler tükenirse çıktı sessiz ölüm değil, tam geçmişli yapılandırılmış
  bir nesnedir: `{error:"verify-exhausted", verifyHistory, implementHistory, ...}`.
- **Spec/plan/report dosyaları diske yazılır** (`docs/compose/{specs,plans,reports}`);
  sonraki `compose start` bunları bulur ve "amendment" moduyla yeniden üretmek
  yerine yerinde düzenler.

### 2. Süreç ölümü (crash / SIGKILL / makine kapandı)

Workflow motoru her ajan sonucunu **senkron** (`appendFileSync`) journal'a işler
(`<data>/workflow/<runID>.jsonl`) — kasıtlı tasarım: SIGKILL anında bile o ana
kadar tamamlanan her ajan diskte. Koşu durumu SQLite'ta (`workflow_run`),
script kopyası `<runID>.js` olarak saklı. Süreç ölünce DB'de `running` kalır
ve koşu **resume edilebilir**: motor journal'ı replay eder — tamamlanmış ajan
sonuçları cache'ten anında döner, yalnız eksikler/başarısızlar yeniden koşar
(deterministik: run başına PRNG seed'i runID'den türetilir).

**Caphlon bağlaması** (no-rewrite: mekanizma MiMo'nun, kapı bizim):

```bash
caphlon compose runs               # kalıcı koşuları gör: runID, faz, işlenen ajan, durum, oturum
caphlon compose resume             # son oturuma bağlamıyla dön (MiMo --continue)
caphlon compose resume <sessionID> # belirli oturuma dön (MiMo --session)
# TUI içinde: /workflows → Resume  (journal replay'ini tetikler)
```

### Dürüst sınırlar

- **Compose ajanı bir skill orkestratörüdür** — her koşu workflow motorunu
  kullanmaz (workflow tool'u deneysel bayrakla varsayılan açık, ama kullanım
  modelin kararıdır). Motor kullanılmadıysa kalıcılık = oturum geçmişi (SQLite)
  + `docs/compose` artefaktları; `compose resume` yine bağlamı geri getirir.
- **Headless resume yok**: koşu resume'u çalışan bir MiMo instance'ı ister
  (TUI `/workflows` ya da HTTP `POST /workflows/:runID/resume`) — Caphlon
  CLI'dan doğrudan tetiklemiyoruz çünkü port keşfi kırılgan olurdu.
- **Veri evi launcher'a bağlıdır**: bundled kip `MiMo-Code-main/.dev-home/data`,
  PATH'teki `mimo` XDG (`~/.local/share/mimocode`). `caphlon compose runs`
  launcher'la AYNI eve bakar; `MIMOCODE_HOME` env ile sabitlenebilir.
- `{error:"verify-exhausted"}` dönüşü DB'de "completed" görünür (script throw
  etmez) ve top-level sonuç DB'ye/journal'a yazılmaz — sonuca erişim oturum
  mesajı üzerindendir.
