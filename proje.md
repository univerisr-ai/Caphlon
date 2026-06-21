

# 🐕 PROJECT UNDERDOG  
## *Kovan Zekası ile Topluluk Destekli, Merkeziyetsiz AI Geliştirme Sistemi*

---

### 📜 1. Projenin Amacı ve Vizyonu

**Project Underdog**, devasa donanım ve bütçelere sahip olmadan, açık kaynaklı yapay zeka modellerini en üst seviyeye çıkarmayı hedefleyen **merkeziyetsiz ve kolektif bir yapay zeka geliştirme aracıdır.**

> **Felsefe:** "Sınıfta notları düşük olan (zayıf/hafif) bir öğrenciye, konuyu en iyi anlayacağı şekilde ve sıkı bir antrenör eşliğinde öğreterek, onu yüksek not alan başarılı öğrencilerle eşitlemek veya onları geçmesini sağlamak."

Sistem, dünyanın dört bir yanındaki gönüllülerin sistemlerini (ücretsiz VPS, yerel bilgisayarlar) birer **işçi arı** gibi kullanarak bilgiyi toplar, filtreler ve ana modele aktarır. Sonuçta, herkesin ücretsiz erişebileceği, sıfır maliyetle devasa bir güce ulaşmış **"Mükemmel AI Boost"** modeli doğar.

---

### 🧠 2. Sistemin Çalışma Mantığı (Adım Adım) ve Araç Eşleştirmesi

| Adım | Manifesto Açıklaması | Bu Projedeki Teknik Karşılığı (İndirilen Araçlar) |
| :--- | :--- | :--- |
| **1. Gönüllü Katılımı (Opt-in)** | Kullanıcı, "sadece soru sor" veya "eğitime destek ver" seçeneklerinden birini seçer. | **Hermes Agent** (`hermes-agent-main.zip`) – Kullanıcının makinesinde çalışan otonom ajan. Başlangıçta bir setup betiği ile bu seçim sunulur. |
| **2. Görev Dağıtımı** | Ana merkez, eksik konuları tespit eder ve boşta olan işçi makineye araştırma görevi atar. | **Qualixar OS** veya **Conductor** (`qualixar-os-main.zip`, `conductor-main.zip`) – Merkezi orkestratör, görev kuyruğunu yönetir. |
| **3. Gölge Boksu (Teacher-Student)** | Zayıf model (Örn: Gemma 2B) taslak cevap üretir, güçlü API (Öğretmen) hataları düzeltir. | Hermes Agent içindeki **öğretmen-öğrenci döngüsü**, `unsloth` veya `LlamaFactory` ile ince ayar yapılarak güçlendirilir. |
| **4. Sentetik Veri Paketleme** | Doğrulanmış soru-cevap çiftleri `.json` formatında paketlenir. | Token optimizasyon araçları (`tokenless`, `token-pilot` vb.) ile veri boyutu küçültülür. |
| **5. Kolektif Yükseliş** | Temiz veriler ana merkeze gönderilir, model sürekli güncellenir. | **Flower** veya **NVFlare** (`flower-main.zip`, `NVFlare-main.zip`) ile federated learning; **GitHub Actions** ile otomatik depolama ve işleme. |

---

### 🏗️ 3. Mimari Yapı ve Altyapı (İndirilen Araçlarla Detaylandırma)

```
┌─────────────────────────────────────────────────────────────────┐
│                     MERKEZİ ORKESTRATÖR                       │
│           (Qualixar OS / Conductor)                          │
│  - Görev kuyruğu ve dağıtımı                                 │
│  - Benzersiz bilgi kontrolü (hash + vektör DB)              │
│  - Doğrulama (çoğunluk oyu, itibar sistemi)                 │
│  - Federated learning koordinasyonu                         │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
    │ VBS-1   │          │ VBS-2   │          │ VBS-3   │
    │Hermes   │          │Hermes   │          │Hermes   │
    │Agent    │          │Agent    │          │Agent    │
    │+Unsloth │          │+Unsloth │          │+Unsloth │
    └────┬────┘          └────┬────┘          └────┬────┘
         │                    │                    │
    ┌────▼─────────────────────────────────────────────▼────┐
    │         TOKEN OPTİMİZASYON KATMANI (Seçili)           │
    │  tokenless, token-pilot, reducethemtokens,           │
    │  openclacky, graphsift, entroly, cge-compiler        │
    └───────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────────────────────────────────┐
    │         DAĞITIK ÖĞRENME / FINE-TUNING              │
    │  Flower, NVFlare (federated learning)              │
    │  LlamaFactory, Axolotl (fine-tuning)               │
    └─────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────────────────────────────────┐
    │          DEPOLAMA & OTOMASYON                       │
    │  GitHub + GitHub Actions (ücretsiz depolama, CI)   │
    └─────────────────────────────────────────────────────┘
```

**Açıklamalar:**

- **VBS'ler (Worker Nodes):** Her gönüllü makinesi, **Hermes Agent** üzerine kurulur. Hermes, kendi kendine öğrenen, görev tamamlama becerileri geliştiren bir ajandır.
- **Token Tasarrufu:** 7 farklı araçtan, ihtiyacına en uygun olanı seçip entegre edeceksin (örneğin, `tokenless` API çağrılarında, `reducethemtokens` kod tabanını sıkıştırmak için).
- **Fine-Tuning & Federated Learning:** `Unsloth` ile hızlı eğitim, `LlamaFactory` ile kolay model özelleştirme, `Flower` ile dağıtık veri paylaşımı.

---

### 🛡️ 4. Güvenlik ve Veri Kalitesi (Zehirli Veri Savunması)

Manifestoda belirtilen 4 katmanlı güvenlik, aşağıdaki teknik bileşenlerle hayata geçirilecek:

| Manifesto Adımı | Teknik Uygulama |
| :--- | :--- |
| **Kovan Mutabakatı (Consensus)** | Aynı görev, en az 3 farklı VBS'ye atanır. Ana merkez (Qualixar OS) cevapları karşılaştırır, çoğunluk kabul edilir. |
| **Hakem Ajanlar (Validator Class)** | Python'da yazılacak bir `Validator` sınıfı, verinin biçimini, mantıksal tutarlılığını ve zararlı içerik olup olmadığını kontrol eder. |
| **Güven Puanı Sistemi (Reputation)** | Her VBS'nin başarı oranına göre puan tutulur. Düşük puanlı düğümlerin verileri otomatik reddedilir. |
| **Tuzak Sorular (Honeypot)** | Ana merkez, cevabını bildiği özel soruları periyodik olarak VBS'lere gönderir. Yanlış cevap verenlerin puanı düşer. |

> **Not:** Bu güvenlik katmanları için indirdiğin araçlar arasında doğrudan bir çözüm yok; ancak `Qualixar OS` ve `Hermes Agent` üzerine Python ile bu mantığı ekleyebilirsin.

---

### 🎯 5. İndirdiğin Araçların Projedeki Kesin Rolleri

| Dosya | Kategori | Bu Sistemdeki Görevi |
| :--- | :--- | :--- |
| `hermes-agent-main.zip` | Uzman Ajan | Her VBS'nin çekirdek motoru. Görev alır, öğretmen-öğrenci döngüsünü yürütür, sonuç üretir. |
| `qualixar-os-main.zip` | Orkestrasyon | Ana merkez olarak kullanılır. Görev dağıtımı, mutabakat, itibar yönetimi. |
| `conductor-main.zip` | Orkestrasyon (alternatif) | Qualixar OS ile birlikte veya onun yerine denenebilir. Belirlenimci iş akışları için. |
| `tokenless-master.zip` | Token Optimizasyonu | API şema sıkıştırma ile %60-90 token tasarrufu. Tüm iletişimde kullanılır. |
| `token-pilot-master.zip` | Token Optimizasyonu | Kod tabanından sadece ihtiyaç duyulan kısımları gönderir. VBS'lerin context yükünü azaltır. |
| `reducethemtokens-main.zip` | Token Optimizasyonu | Repoyu yapısal iskelete dönüştürür, %90 tasarruf. Büyük kod projelerinde kullanılır. |
| `openclacky-main.zip` | Token Optimizasyonu | Ajanın kendisi token verimli çalışır. Hermes Agent ile birlikte denenebilir. |
| `graphshift-master.zip` | Token Optimizasyonu | Kod incelemesinde 80-150 kat tasarruf. Özellikle PR/inceleme görevlerinde. |
| `entroly-main.zip` | Token Optimizasyonu | Tüm kod tabanını matematiksel olarak optimize edilmiş contexte sığdırır. |
| `cge-compiler-main.zip` | Token Optimizasyonu | Kodu bilişsel grafik kodlamasına çevirir, %55-86 tasarruf. |
| `unsloth-main.zip` | Fine-Tuning | Model eğitimini hızlandırır, VRAM tasarrufu sağlar. VBS'lerin arka plan modellerini güçlendirir. |
| `NVFlare-main.zip` | Federated Learning | NVIDIA'nın üretim seviyesi federated learning platformu. Veri paylaşımı için. |
| `LlamaFactory-main.zip` | Fine-Tuning | 100+ model desteği, web UI ile kolay fine-tuning. Toplanan verilerle model güncellemek için. |
| `flower-main.zip` | Federated Learning | Dünyanın en büyük federated AI topluluğu. Gönüllü ağını yönetmek için. |
| `axolotl-main.zip` | Fine-Tuning | Esnek, YAML konfigürasyonlu fine-tuning. Gelişmiş kullanıcılar için. |

---

### 🗺️ 6. Aşamalı Yol Haritası (Ne Zaman Ne Yapılacak?)

#### ✅ Aşama 0: Hazırlık (Bugün–1 gün)
- Tüm zip dosyalarını aç ve klasör yapılarını incele.
- Her birinin `README.md` veya `INSTALL.md` dosyasını oku.
- Python 3.11+, Node.js (varsa), CUDA (GPU varsa) kurulumlarını tamamla.

#### ⚙️ Aşama 1: Orkestratörü Kur (1 hafta)
- **Qualixar OS**'u çalıştır. Basit bir "ping" görevi oluştur.
- **Hermes Agent**'ı tek bir makinede çalıştır ve Qualixar OS'a bağla.
- İlk "Merhaba Dünya" görevini tamamla.

#### 🔧 Aşama 2: Token Optimizasyonu Entegrasyonu (2 hafta)
- İlk olarak `tokenless` ve `token-pilot`'u devreye sok.
- Token tüketimini ölç, karşılaştırma yap.
- Diğer 5 aracı dene, en iyi kombinasyonu bul (hepsini birden kullanma, çakışabilir).

#### 🌐 Aşama 3: Dağıtık Ağa Geçiş (2 hafta)
- **Flower** veya **NVFlare** ile 2-3 gönüllü makineyi sisteme dahil et.
- Her birine Hermes Agent kur, ana merkeze bağlanmasını sağla.
- Basit bir federated öğrenme denemesi yap (ör. hepsi aynı basit modeli güncelle).

#### 🧪 Aşama 4: Fine-Tuning ile Model Özelleştirme (3 hafta)
- **LlamaFactory** ile toplanan verileri kullanarak küçük bir modeli (7B) fine-tune et.
- **Unsloth** ile eğitim hızını artır.
- Elde edilen yeni modeli Hermes Agent'ların arka planına koy.

#### 🛡️ Aşama 5: Güvenlik Katmanını Kodla (Devam eden)
- Python ile `Validator` sınıfını yaz.
- İtibar sistemi ve tuzak soru mekanizmasını ekle.
- Tüm testleri yap.

#### 🚀 Aşama 6: Topluluk ve Yaygınlaştırma
- Projeyi GitHub'ta public repo olarak aç.
- README, katkı rehberi ve bu dokümanı ekle.
- İlk beta testçilerini topla, geri bildirimlere göre iyileştir.

---

### 🔍 7. Karşılaşabileceğin Zorluklar ve Çözüm Önerileri

| Zorluk | Çözüm |
| :--- | :--- |
| **API maliyetleri** | Sadece öğretmen-öğrenci döngüsünde API kullan, diğer işlemleri yerel modellerle yap. Ayrıca `tokenless` gibi araçlarla token sayısını minimize et. |
| **Düşük katılım** | Başlangıçta kendi makinelerinde birkaç VBS çalıştırarak prototip oluştur. Topluluk büyüdükçe katılım artar. |
| **Veri kalitesi** | Çoğunluk oyu ve itibar sistemi ile zehirli veriyi engelle. Honeypot ile hilecileri tespit et. |
| **Donanım yetersizliği** | Unsloth, QLoRA gibi verimli yöntemlerle düşük VRAM'de çalış. Flower ile yükü dağıt. |
| **Entegrasyon karmaşıklığı** | Her aracı ayrı ayrı test et, çalıştıktan sonra birleştir. Başlangıçta sadece 2-3 araçla başla. |

---

### 📌 8. İlk Adımda Bugün Ne Yapacaksın?

1. **Qualixar OS**'un klasörüne gir, `README`'yi oku, bağımlılıkları yükle (`npm install` veya `pip install -r requirements.txt`).
2. **Hermes Agent**'ı da aynı şekilde kur.
3. Qualixar OS'u başlat, bir "test" görevi tanımla (ör. "VBS'ye 2+2 kaçtır diye sor").
4. Hermes Agent'ı çalıştır ve cevabı al.
5. Ardından `tokenless`'ı devreye sok, token tüketimini karşılaştır.

> **Unutma:** Bu projede "mükemmel" değil, "çalışan" olmak öncelik. Zamanla iyileşecek.

---

### 💬 9. Son Söz

Project Underdog, sadece bir yazılım projesi değil; **yapay zekanın demokratikleşmesi** için bir harekettir. Elinde muazzam bir araç seti var. Şimdi sıra, bu araçları bir araya getirip ilk kıvılcımı ateşlemekte.

> *"Birlikte öğrenen, birlikte güçlenir."* – Kovan Zekası Manifestosu

---

Bu dokümanı `PROJECT_UNDERDOG.md` olarak kaydedip proje ana klasörüne koyabilirsin. İstersen bu planın ilk adımı olan **Qualixar OS + Hermes Agent** kurulumu için detaylı bir rehber de hazırlayabilirim. Nereden başlamak istediğini söyle, devam edelim! 🚀
