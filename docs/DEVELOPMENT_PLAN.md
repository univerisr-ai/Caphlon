# Caphlon — Geliştirme Planı (Eksik Kapatma)

> **Tarih:** 2026-06-29 · *güncelleme 2026-07-01*
> **Kapsam:** Mevcut kod tabanının kanıta dayalı durum tespiti + önceliklendirilmiş yol haritası.
> **Yöntem:** `typecheck` (0 hata), `caphlon doctor` (18/18), komut akış denemeleri, çekirdek dizin denetimi.

> ⚠️ **Dal/merge durumu (2026-07-01):** Aşağıda "Bitti" işaretli P0/P1 kalemleri **`feat/wire-tools-and-caphlon-ui`
> dalında** yaşıyor — `origin/main`'e **henüz merge edilmedi** (dal 27 commit ileride, main 2 commit ıraksak).
> `origin/main` ayrı bir **Ink+React TUI** taşıyor; merge `package.json` / `src/index.ts` / `tsconfig.json`'da
> çakışır ve iki UI yaklaşımının uzlaştırılmasını gerektirir. Yani bu maddeler *dalda* doğrulandı ama
> *main'de henüz yok* — "Done" ⇒ "dalda ship, main'e merge bekliyor" diye okuyun.

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

### P1-2 · SkillEvolver temeli (GAP_ANALYSIS #1)
MiMo Dream/Distill var; üstüne **otomatik skill mutation** (öner-uygula değil, **öner-onayla**):
trace → aday skill diff → judge → insan onayı. **Done:** Bir trace'ten onaylı bir skill üretilir.

### P1-3 · Blind Verification (GAP_ANALYSIS #2)
Generator ↔ verifier izolasyonu: üreten modelin çıktısını **bağımsız** bir judge doğrular,
üretici kendi işini onaylayamaz. **Done:** `caphlon max` / compose verify aşamasına entegre, test.

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

- **P2-1 · tokenless** opsiyonel kurulum yardımcısı (`cargo` yoksa net mesaj, atla).
- **P2-2 · Living Marketplace** (GAP #3): evolved skill'lerin yayınlanması — Faz 1 sync üstüne.
- **P2-3 · MiMo Voice** (GAP #5): `/voice` ASR'ı Qualixar'a taşı.
- **P2-4 · Open Design Desktop** (GAP #4): native app entegrasyonu — ayrı epik.
- **P2-5 · `.env.example` ↔ `connect`** tutarlılık denetimi + `caphlon status` zenginleştirme.

---

## Önceliklendirilmiş İcra Sırası

1. **P0-1** `run` onarımı  → 2. **P0-2** çekirdek kurulum/doctor smoke → 3. **P0-3** CI duman testi
4. **P1-1** skill sync → 5. **P1-4** doctor --fix → 6. **P1-3** blind verification → 7. **P1-2** SkillEvolver
8. P2 kalemleri ihtiyaç sırasına göre.

> **İlke:** Her kalem bir testle "shipped" sayılır; orkestratör/exec/secrets dokunuşları ayrı PR + gözden geçirme.
