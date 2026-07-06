# Caphlon — Geliştirme Planı (Eksik Kapatma)

> **Tarih:** 2026-06-29 · *güncelleme 2026-07-01*
> **Kapsam:** Mevcut kod tabanının kanıta dayalı durum tespiti + önceliklendirilmiş yol haritası.
> **Yöntem:** `typecheck` (0 hata), `caphlon doctor` (18/18), komut akış denemeleri, çekirdek dizin denetimi.

> **Dal/merge durumu (güncel, 2026-07-06):** Varsayılan dal **`master`**'dır ve
> bu plandaki tüm işler oraya merge edilmiştir (PR #2–#25). Eski uyarıdaki
> `feat/wire-tools-and-caphlon-ui` dalı PR #3/#4 ile merge edilip silindi.
> `origin/main` ise terk edilmiş Ink+React TUI denemesini taşıyan **bayat bir
> daldır** (2 merge edilmemiş commit, master'dan ~70 commit geride) — no-rewrite
> ilkesiyle çelişen bu yön yerine gerçek OpenCode TUI'si bağlandı (`caphlon ui`).
> Silme/arşivleme kararı bekliyor; yeni iş ASLA main'e açılmaz.

---

## 0. Mevcut Sağlık (referans)

- ✅ Caphlon CLI: TypeScript temiz derleniyor, 26 komut `commander` ile wire edilmiş.
- ✅ Köprüler hazır (doctor): Open Design (built), Aider (venv 3.11), OpenCode TUI, MiMo Code, Hermes, Flower.
- ✅ Skill katmanı: 131 skill indekslendi.
- ⚠️ `core/qualixar-os-main` **bağımlılıkları kurulu değil** (node_modules yok).
- ⚠️ Headline komut `caphlon run` çalışmıyor (aşağıda P0-1).
- ℹ️ tokenless kurulu değil (opsiyonel).

---

## Durum (2026-06-29 güncellemesi)

| Kalem | Durum | Not |
|---|---|---|
| **P0-1** `run` onarımı | ✅ **Bitti + uçtan uca doğrulandı** | Lock tabanlı çapraz-process keşif + oto-başlatma + hızlı-başarısız + 3 birim testi. `caphlon run "ping"` → `{taskId, pending}`, exit 0, geçici sunucu temiz kapanıyor. |
| **P0-2** çekirdek kurulum/doctor | ✅ **Bitti** | `doctor` artık dürüst (dist+node_modules); `make setup-cores` qos'u Node 22 ile kurar+derler. qos şimdi `dist/channels/cli.js` ile çalışır. |
| **P0-3** CI duman testi | ✅ **Bitti** | `caphlon-cli` job: install → typecheck → build → test → doctor/run smoke. |

### P0 sırasında çözülen ek bridge hataları
- **Yanlış serve bayrağı:** bridge `--dashboard-port <port>` geçiyordu; qos `serve` yalnızca `-p/--port` + boolean `--dashboard` kabul ediyor → düzeltildi (`startQos(..., { dashboard })`).
- **Node ABI uyumu:** native `better-sqlite3` Node 22 için derlendiğinden, bridge çağıran Node 24+ ise qos'u otomatik bulduğu **Node 22 binary'si** ile başlatır (`resolveNodeForQos`). `setup-cores.sh` de qos adımı için Node 22'yi otomatik seçer.

> **Ortam notu:** Sistem Node'u v26; qos native bağımlılığı için `brew install node@22` (veya nvm 22) kuruldu. Bridge ve setup script bunu şeffaf kullanır — kullanıcının elle sürüm değiştirmesi gerekmez.

---

## Faz 1 — P0: "Çalışır demo" engelleri (önce bunlar)

### P0-1 · `caphlon run` akışını onar (kırık)
**Belirti:** `caphlon run "merhaba"` → *"Qualixar OS çalışmıyor"*.
**Kök neden:** `qos-bridge.ts` `runTask()` yalnızca aynı process'teki bellek-içi `activeInstance`'a
bakar. `caphlon dev` ayrı bir process olduğundan iki uçlu hiçbir senaryoda bağlanamaz.
**Çözüm:**
- `run`, qos'u **otomatik başlatsın** (ephemeral) veya çalışan bir daemon'a **keşif yoluyla** bağlansın.
- Çalışan qos portunu bir lock/pid dosyasından (`~/.caphlon/qos.json`: port, pid, başlangıç zamanı) keşfet.
- `runTask(prompt, { autostart: true })`: instance yoksa `startQos()` → bekle → POST → (ephemeral ise) kapat.
- Çıkış kodu doğru olsun (başarısızlıkta non-zero), JSON yerine okunur özet bas.
**Done:** `caphlon run "iki sayıyı topla"` tek komutla (dev olmadan) sonuç döndürür; e2e test eklenir.

### P0-2 · Çekirdek orkestratörü kurulabilir/çalışır yap
**Belirti:** `core/qualixar-os-main/node_modules` yok; `doctor` yalnızca dizini kontrol ediyor.
**Çözüm:**
- `caphlon doctor`'a **deps + qos serve smoke** kontrolü ekle (sadece dizin değil, `qos.js --version`).
- `scripts/setup.sh` (veya `make setup`): qos, aider, hermes, tokenless çekirdeklerini idempotent kurar.
- `caphlon dev` ilk çalıştırmada eksik deps'i tespit edip net talimat/oto-kurulum sunsun.
**Done:** Temiz makinede `make setup && caphlon dev` qos'u ayağa kaldırır, `/api/health` 200 döner.

### P0-3 · Uçtan uca duman testi (CI)
**Çözüm:** `.github/workflows/ci.yml`'e ekle:
- `npm ci && npm run typecheck` (caphlon paketi)
- `caphlon doctor` (kritik kontroller hata vermemeli)
- `caphlon run` smoke (sahte/lokal model ile)
**Done:** PR'lar yeşil/kırmızı sinyal verir; regresyon yakalanır.

---

## Faz 2 — P1: Vaat edilen ama yarım kalanlar

### P1-1 · `skill sync` Faz 2 (GitHub push) — ✅ **Bitti**
~~Şu an "henüz etkin değil".~~ Tamamlandı: `caphlon skill sync push <owner/repo>` öğrenilen
skill'leri git reposuna gönderir, `pull` temiz makineye geri çeker. Uzak depo `sync.json`'da saklanır
(bir kez ver, sonra argümansız). Push öncesi mirror senkronu (çakışma azaltma), idempotent (değişiklik
yoksa commit yok), kanonik `main` dalı (git-sürümü bağımsız), yerel-yol koruması (GitHub'a sapmaz).
**Done ✓:** push→pull round-trip 3 birim testiyle (yerel bare repo, ağsız) doğrulandı.

### P1-2 · SkillEvolver temeli (GAP_ANALYSIS #1) — ✅ **Bitti**
MiMo Dream/Distill var; üstüne **otomatik skill mutation** (öner-uygula değil, **öner-onayla**):
trace → aday skill diff → judge → insan onayı. **Done ✓:** `caphlon skill evolve`
(judge kapısı + insan onayı) çalışıyor; GAP_ANALYSIS #1 ✅.

### P1-3 · Blind Verification (GAP_ANALYSIS #2) — ✅ **Bitti**
Generator ↔ verifier izolasyonu: üreten modelin çıktısını **bağımsız** bir judge doğrular,
üretici kendi işini onaylayamaz. **Done ✓:** `caphlon max` + `caphlon connect --judge`
(ayrı judge modeli) çalışıyor; GAP_ANALYSIS #2 ✅. Kalan tek açık uç aşağıdaki
federated notundaki "compose verify aşamasına aynı izolasyonun taşınması".

> **Federated varyant — ✅ wired (2026-07-01):** Kovan federated katmanında blind-eval gate artık
> koordinatöre bağlı. `hive_server.HiveState(eval_fn=...)` verilirse, birleştirilen aday LoRA adapter
> yalnızca **bağımsız holdout skorunu** (mevcut dağıtımdaki adapter'a göre) artırırsa otomatik
> `verified=True` yayınlanır; regresyon reddedilir. `eval_fn` yoksa saf-stdlib davranış korunur
> (doğrulanmamış yayın + dışsal `/adapter/verify` fail-safe). Test: `test_hive_fed.HiveFedGateTest`
> (kabul→oto-doğrula+pull, ve regresyon→red). **Kalan:** gerçek model koşturan holdout harness'ının
> (`fine_tune`/`model_serve` üstünden) enjekte edilmesi ve `caphlon max`/compose verify aşamasına
> aynı izolasyonun taşınması.

### P1-4 · `caphlon doctor --fix` — ✅ **Bitti**
Hata varsa idempotent `setup-cores`'u çalıştırıp tek seferlik yeniden tanılar (sonsuz döngü yok).
Sağlıklı sistemde onarımı atlar; hatada exit 1. **Done ✓:** sağlıklı sistemde doğrulandı.

---

## Faz 3 — P2: Olgunlaşma / opsiyonel

- **P2-1 · tokenless** opsiyonel kurulum yardımcısı (`cargo` yoksa net mesaj, atla). **Done ✓**
- **P2-2 · Living Marketplace** (GAP #3): evolved skill'lerin yayınlanması — Faz 1 sync üstüne.
  **Done ✓:** `caphlon skill sync push/pull` (git shell-out) `skill evolve` akışına bağlı;
  `config/skills.test.ts` gerçek yerel git remote ile push/pull'u doğrular.
- **P2-3 · MiMo Voice** (GAP #5): `/voice` zaten MiMo Code'un içinde gerçek ve
  çalışan bir özellik (`caphlon ui` bunu miras alır) — "Qualixar'a taşı" yanlış
  çerçevelemeydi, iki farklı katmanı (TUI-lokal ses girişi vs orkestrasyon
  kanalı) karıştırıyordu. **Done ✓ (küçük parça):** `caphlon doctor` artık
  platforma özgü mikrofon kaydedici (sox/rec/arecord) varlığını bilgilendirici
  olarak kontrol ediyor.
  **Xiaomi köprüsü — araştırıldı, KAPATILDI (2026-07-05):** `MIMOCODE_AUTH_CONTENT`
  env var'ı gerçek/canlı bir kod yolu (`auth/index.ts:59-62`, MiMo'nun kendi
  `control-plane/workspace.ts`'i alt-workspace'lere kimlik aktarırken kullanıyor;
  `plugin/mimo.ts:101-104` beklenen `{type:"api", key, metadata:{base_url}}`
  şeklini de doğruladı) — mekanizmanın kendisi güvenilir. Ama asıl engel bu
  değil: Xiaomi bir API key'i kopyala-yapıştır olarak vermiyor, anahtar
  (`result.sk`) yalnızca tarayıcıda ECDH+AES-GCM şifreli bir OAuth exchange'i
  tamamlandığında ortaya çıkıyor (`plugin/mimo.ts:170-186`). Caphlon'un bu
  anahtarı ORİJİNAL olarak üretmesinin iki yolu var, ikisi de kabul edilemez:
  (a) Xiaomi'nin OAuth/ECDH akışını kendi başına yeniden uygulamak → no-rewrite
  ilkesini doğrudan ihlal eder; (b) MiMo'nun kendi `auth.json`'ından (özel iç
  durumu, `Global.Path.data`) anahtarı okuyup kopyalamak → dokümante olmayan
  bir iç dosya biçimine/konumuna kırılgan bağımlılık yaratır. Üstelik hiçbiri
  gerekli de değil: kullanıcı `caphlon ui` içinde bir kez `/login`→xiaomi
  yapınca MiMo zaten kendi `auth.json`'ını okuyup voice'u çalıştırıyor — köprü
  yalnızca kozmetik bir kazanım (`caphlon status`'ta görünürlük) için kırılgan
  bir bağımlılık ekler. **Karar: yapılmayacak.** Qualixar OS'a "voice channel"
  olarak taşımak ise tamamen ayrı bir mimari tasarım kararı, bu maddenin dışında.
- **P2-4 · Open Design Desktop** (GAP #4): araştırıldı, KAPATILDI (2026-07-05).
  Open Design'ın native masaüstü uygulaması (macOS/Windows, Electron —
  `apps/desktop` + `apps/packaged`, `od://` protokol handler'ı) upstream'de
  ZATEN yazılmış, code-signed, notarize edilmiş ve dağıtılıyor
  (open-design.ai, GitHub Releases). Caphlon bilinçli olarak yalnızca
  daemon+CLI alt kümesini taşıyor (`open-design-main/apps/daemon`) — desktop/web
  klasörlerini dahil etmiyor. No-rewrite ilkesine göre burada Caphlon'un
  yazacağı hiçbir şey yok; ürün zaten var. Tek opsiyonel/küçük iş — kurulu
  native app varsa `caphlon design ui`'nin tarayıcı yerine onu tetiklemesi —
  gerçek kurulu app olmadan doğrulanamadığı için (test edilmemiş davranış
  merge edilmez) YAPILMADI; istenirse ayrı, doğrulanabilir bir P3 notu.
- **P2-5 · `.env.example` ↔ `connect`** tutarlılık denetimi + `caphlon status` zenginleştirme. **Done ✓** (2026-07-05)
  `src/env-example.test.ts` dört invariantı yapısal olarak kilitler: compose'un
  `${VAR}` referansları belgelidir; kodun okuduğu `CAPHLON_*` değişkenleri
  belgelidir (bu denetim `CAPHLON_HOME` eksiğini yakalattı → `.env.example`e
  eklendi); belgelenen her değişkenin gerçek tüketicisi vardır; sağlayıcı API
  anahtarları `.env.example`e asla giremez (tek yol `caphlon connect`).
  `caphlon status` artık LLM bağlantısını (aktif model, anahtar var/yok —
  değeri asla yazdırılmaz, judge modeli) ve skill/sync durumunu da gösterir
  (`src/commands/status.test.ts`).

---

## Önceliklendirilmiş İcra Sırası

1. **P0-1** `run` onarımı  → 2. **P0-2** çekirdek kurulum/doctor smoke → 3. **P0-3** CI duman testi
4. **P1-1** skill sync → 5. **P1-4** doctor --fix → 6. **P1-3** blind verification → 7. **P1-2** SkillEvolver
8. P2 kalemleri ihtiyaç sırasına göre.

> **İlke:** Her kalem bir testle "shipped" sayılır; orkestratör/exec/secrets dokunuşları ayrı PR + gözden geçirme.

---

## Bileşen Etiketlemesi — Çekirdek / Koşullu / Deneysel (2026-07-05)

P0–P2 backlog'u kapandıktan sonra sorulan "hepsi gerekli mi?" sorusunun
cevabı: **hayır**. README'deki Bileşenler tablosuna dürüst bir Durum sütunu
eklendi:

- **Çekirdek:** OpenCode TUI, Aider, Caphlon'un kendi katmanları (connect,
  skill + kör doğrulama, doctor/status).
- **Koşullu:** Qualixar, Open Design, MiMo, Kovan güvenlik katmanı — ilgili
  iş akışı gerçekten kullanılıyorsa değerli.
- **Deneysel:** Hermes, Flower, fine-tuning hattı, tokenless — bağlı ve
  çalışır, ama uçtan uca değer ürettiği hiç kanıtlanmadı (Hermes→Flower
  eğitim döngüsü hiç koşulmadı; deponun ~1.7M satırı bu ikisinde).

Karar kuralı: birkaç haftalık gerçek kullanımda dokunulmayan Deneysel parça
silinmez ama zihinsel yükten çıkar; terfi/emeklilik kararını kullanım verir.
Hiçbir kopya bu kararla silinmedi — bu bir etiketleme, temizlik değil.

---

## P3 · Küçük açık uçlar (2026-07-06 denetimi)

- ~~OpenCode profil şablonu~~ **Çözüldü (2026-07-06):** `opencode.json` artık
  git'te izlenmiyor (gitignore); izlenen `opencode.template.json` şablonundan
  `ensureProfileConfig` taze klonda üretir, var olana asla dokunmaz
  (`ui.test.ts` kilitli). Runtime mcp yazımları artık repo'yu kirletemez.
- **origin/main:** terk edilmiş Ink+React TUI dalı (2 merge edilmemiş commit).
  Silme/arşivleme kullanıcı kararı.
- **compose verify izolasyonu:** P1-3 notundaki tek kalan uç.
