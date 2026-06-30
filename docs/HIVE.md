# Kovan Zekası — Kapalı Döngü (Hive Intelligence)

> **Hedef:** 2GB RAM / i5 3. nesil sınıfı **binlerce zayıf düğüm**, zayıf bir
> modeli (ör. Gemma-2B) düşük tüketimle pratikte güçlü-model kalitesine
> yaklaştırsın. Para değil, **kalabalık + konsensüs + ortak hafıza** ile.

## Güç nereden gelir? (üç katman, hepsi düşük-tüketimli)

| # | Katman | Etki | Düğüm başına maliyet | Durum |
|---|---|---|---|---|
| 0 | **Öz-topluluk (self-consistency)** | Tek kullanıcıda bile: aynı modeli N kez örnekle → konsensüs. Swarm büyüyünce otomatik gerçek düğüm konsensüsüne döner. | N küçük çıkarım | ✅ (`hive solve`) |
| 1 | **Consensus ensemble** | Aynı soru N düğüme; itibar-ağırlıklı oyla en iyi cevap. Bağımsız hatalar → çoğunluk doğru (Condorcet). | 1 küçük çıkarım | ✅ P0 (kodlandı) |
| 2 | **Paylaşımlı çözüm önbelleği** | Bir düğüm çözünce herkes retrieval ile alır. N kullanıcı = N× hafıza. | ~0 (retrieval) | ✅ P0 (kodlandı) |
| 3 | **Federated LoRA** | Ortak adapter arka planda gerçekten güçlenir; herkes indirir. | periyodik lokal LoRA | ⏳ P1 |

**Kanıt (simülasyon, `core/hive_demo.py`):** tek düğüm %45 → 7 düğüm %78 →
51 düğüm %100. Ağırlık eğitimi olmadan, sadece konsensüsle.

## Akış

```
Soru
 ├─ 1. lookup        paylaşımlı önbellekte var mı? → varsa model çağırma   [hive_cache.py]
 ├─ 2. fan-out       yoksa N online düğüm kendi küçük modeliyle yanıtlar
 ├─ 3. validate      format/mantık/güvenlik süzgeci                         [security.Validator]
 ├─ 4. consensus     benzerlikle kümele + itibar×özgüven oyla              [security.ReputationSystem]
 ├─ 5. learn         kazanan → itibar güncelle + önbelleğe yaz             [hive_cache.record]
 └─ honeypot         tuzak sorularla itibar kalibrasyonu (zehir savunması) [security.Honeypot]
```

## Zehir / kötüye kullanım savunması (açık sistem güvenli olsun)

- **Validator** — çöp/zararlı cevap makineden çıkmadan elenir.
- **Reputation** — kötü katkı verenin oy ağırlığı küçülür.
- **Honeypot** — cevabı bilinen tuzak sorularla hileli düğüm yakalanır.
- **Blind-eval gate (P1)** — adapter ancak holdout skorunu artırırsa yayınlanır.

## Gizlilik

Ham veri/kod düğümden **çıkmaz**; konsensüste sadece cevap, federated'de sadece
LoRA ağırlık farkı paylaşılır. Açık opt-in. (Benimsenmenin = ölçeğin şartı.)

## Dosyalar

**P0 — çıkarım çekirdeği**
- `core/hive_cache.py` — paylaşımlı çözüm önbelleği (sqlite, saf stdlib)
- `core/hive_engine.py` — çıkarım orkestratörü (security.py + cache bağlanır)
- `core/test_hive.py` — 9 test
- `core/hive_demo.py` — ölçek simülasyonu (sayısal kanıt)

**P1 — ağ swarm'ı + capture→train**
- `core/hive_server.py` — koordinatör (SuperLink; stdlib HTTP, ortak önbellek+itibar+federated)
- `core/hive_node.py` — düğüm istemcisi + `ask()` + `submit-delta`/`pull` (takılabilir model)
- `core/trajectory_capture.py` — konsensüs çözümleri → LoRA eğitim JSONL'i
- `core/hermes_flower_bridge.py` — [deprecated] gerçek köprüye yönlendiren shim

**P1.5 — federated birleştirme + adapter dağıtımı**
- `core/fed_aggregate.py` — anomali eleme + itibar-ağırlıklı FedAvg + blind-eval gate
- `core/adapter_registry.py` — sürümlü global adapter deposu (publish/pull/rollback)
- `core/lora_io.py` — gerçek LoRA tensör ↔ JSON-vektör köprüsü (torch-korumalı)
- testler: `test_hive(_server|_fed)`, `test_trajectory`, `test_fed_aggregate`
- `packages/caphlon/src/commands/hive.ts` — `serve|join|ask|train|submit-delta|pull|stats|demo`

> Toplam **35/35 Python testi** + CLI typecheck temiz + iki uçtan-uca duman geçti:
> (1) ask→3 düğüm→quorum→konsensüs→önbellek→eğitim JSONL,
> (2) 3 delta→FedAvg→adapter v1 yayını→pull→stats.

## Yol haritası

- **P0 ✅ — Kovan çıkarım çekirdeği** (consensus + önbellek + güvenlik bağlandı, testli).
- **P1 ✅ — Ağ swarm'ı + capture→train köprüsü**
  - `caphlon hive` CLI: koordinatör + düğüm + ask + train + stats + demo.
  - Gerçek HTTP swarm akışı (register/ask/answer/quorum-autoresolve); makineler arası ortak önbellek+itibar.
  - `trajectory_capture.py`: konsensüs-onaylı çözümler → `fine_tune.py` JSONL'i.
- **P1.5 ✅ — Federated birleştirme + adapter dağıtımı**
  - Düğüm `caphlon connect` modeline otomatik bağlanır (OpenAI-uyumlu çağrı; `--model-cmd` opsiyonel).
  - İtibar-ağırlıklı FedAvg + anomali (zehir) eleme + blind-eval gate (kütüphane, testli).
  - Sürümlü global adapter registry: `submit-delta` → birleştir → yayınla → `pull`. Rollback hazır.
  - `lora_io`: gerçek LoRA tensör ↔ JSON-vektör köprüsü (torch ile çalışır).
- **P2 — kalan / olgunlaşma**
  - **Blind-eval'i canlıya bağla:** model koşturan holdout harness'ı (şu an gate kütüphane olarak hazır, koordinatör screen+FedAvg+publish yapıyor).
  - `model_serve.py` adapter merge'i (pull edilen adapter'ı zayıf base'e yükle).
  - Katkı panosu (kim ne kadar güçlendirdi), diferansiyel gizlilik gürültüsü, oto-pull zamanlayıcı.

## İddia kanıtlanabilir mi? — gerçek ölçümler

Gerçek modellerle yapılan ölçümler (SOLO tek çağrı vs HIVE ensemble+konsensüs):

| Senaryo | SOLO | HIVE | Δ | Neden |
|---|---|---|---|---|
| Güçlü model (deepseek-v4-flash) | %100 | %100 | **0** | tavan — kaldıracak boşluk yok |
| Zayıf model (qwen 0.5b, self-ensemble) | %50 | %50 | **0** | hatalar **korelasyonlu** (hep aynı yanlış) |

**Net bulgu:** Saf consensus, düğümler **aynı** modeli koşarsa fark yaratmaz —
tek bir modelin hataları bağımsız değil, sistematiktir (Condorcet bağımsızlık
ister). Gerçek katkı **model çeşitliliği** ya da **ortak hafıza/federated**
gerektirir.

> Asıl risk: aynı zayıf modeli koşan düğümlerin hataları korelasyonludur →
> konsensüs beklenenden az kazandırır.

## Federated fail-safe (kötü adapter sessizce yayılmaz)

Koordinatör model çalıştıramadığı için birleştirilen adapter **doğrulanmamış**
yayınlanır; düğümler `pull` ile **yalnızca DOĞRULANMIŞ** adapter çeker. Bağımsız
bir eval `/adapter/verify` ile onaylayana dek dağıtılmaz → self-distillation
çökme riskine karşı koruma. (Gerçek eval harness'ı modelle koşmak P2'de.)

## Dürüst sınır

Tek 2GB model, ağırlıkla Opus olmaz. (1) konsensüs + (2) ortak hafıza **anında**,
(3) federated LoRA **biriken** kazanç hedefler; üçü birlikte, çok ve **çeşitli**
düğümle güçlü-model kalitesine *yaklaşır* — "eşit" değil, "yaklaşır". Federated
LoRA en kırılgan halka: kötü veriyle modeli **bozabilir** de → fail-safe + eval
şart.
