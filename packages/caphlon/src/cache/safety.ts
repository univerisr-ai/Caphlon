/**
 * Caphlon — Havuz güvenlik kapısı (zararlı içerik + tehlikeli komut freni).
 *
 * Sır kapısı (dual-cache scanSecrets) "gizli veri sızmasın" derdiyle ilgilenir;
 * BU katman farklı bir soruya bakar: paylaşılan çözüm KÖTÜ AMAÇLI mı, ya da
 * körlemesine uygulanınca makineyi mahvedecek bir komut mu içeriyor?
 *
 * Kaynak: Caphlon'un kendi Kovan güvenlik katmanı (core/security.py
 * Validator.HARMFUL_PATTERNS) — orada yalnız konsensüs cevaplarına
 * uygulanıyordu; çözüm havuzuna da aynı kalıplar getirildi ve "yıkıcı komut"
 * ailesiyle genişletildi. İki yönlü çalışır:
 *   - contribute/import: zararlı satır havuza GİRMEZ
 *   - borrow: yine de bir şey sızmışsa ajan UYARILIR (körlemesine uygulamasın)
 *
 * Tasarım: eşleşme = RED (fail-closed). Yanlış pozitif riski kabul edilir;
 * bir çözümün paylaşılamaması, zararlı bir çözümün yayılmasından iyidir.
 */

export interface SafetyFinding {
  /** Kısa, kullanıcıya gösterilebilir sebep */
  reason: string;
  /** true → asla paylaşma/ekleme; false → uyar ama engelleme */
  blocking: boolean;
}

const RULES: { re: RegExp; reason: string; blocking: boolean }[] = [
  // --- core/security.py HARMFUL_PATTERNS aynası ---
  {
    re: /\b(how|tutorial|guide|nasıl)\b.*\b(hack|exploit|malware|ransomware|phish|keylogger)\b/i,
    reason: 'kötü amaçlı içerik (saldırı/zararlı yazılım rehberi)',
    blocking: true,
  },
  {
    re: /\b(make|create|build|recipe|yap|üret)\b.*\b(bomb|weapon|poison|bomba|silah|zehir)\b/i,
    reason: 'zararlı içerik (silah/patlayıcı/zehir üretimi)',
    blocking: true,
  },
  {
    re: /\b(ssn|credit.?card|kredi.?kart|password|parola)\b.*\b\d{3,4}[-\s]?\d{4,6}\b/i,
    reason: 'kişisel/finansal veri sızıntısı deseni',
    blocking: true,
  },

  // --- Yıkıcı komut ailesi: körlemesine uygulanırsa makineyi bozar ---
  {
    re: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*f|\brm\s+-fr\b/,
    reason: 'yıkıcı komut (rm -rf)',
    blocking: true,
  },
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, reason: 'fork bomb', blocking: true },
  { re: /\bmkfs(\.\w+)?\b|\bdd\s+[^|\n]*of=\/dev\/(sd|nvme|disk)/i, reason: 'disk biçimlendirme/üzerine yazma', blocking: true },
  { re: /\bchmod\s+(-[a-zA-Z]+\s+)*777\s+\//, reason: 'kök dizinde 777 izni', blocking: true },
  {
    re: /\bcurl\b[^|\n]*\|\s*(sudo\s+)?(ba|z|k)?sh\b|\bwget\b[^|\n]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/i,
    reason: 'doğrulanmamış uzak script’i doğrudan kabuğa boru (curl|sh)',
    blocking: true,
  },
  {
    re: /\bgit\s+push\s+(-[a-zA-Z-]+\s+)*(--force|-f)\b/,
    reason: 'zorla push (geçmiş silinebilir)',
    blocking: false, // meşru kullanımı var — uyar, engelleme
  },
  {
    re: /\bnpm\s+publish\b|\bgh\s+auth\s+token\b|\bkeychain\b.*\bdump\b/i,
    reason: 'yayın/kimlik-sırrı komutu içeriyor',
    blocking: false,
  },
];

/** Metni tara. Boş dizi = temiz. */
export function scanHarmful(text: string): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  for (const r of RULES) {
    if (r.re.test(text)) out.push({ reason: r.reason, blocking: r.blocking });
  }
  return out;
}

/** Paylaşıma/eklemeye engel olan bulgular (fail-closed kapı). */
export function blockingFindings(text: string): SafetyFinding[] {
  return scanHarmful(text).filter((f) => f.blocking);
}
