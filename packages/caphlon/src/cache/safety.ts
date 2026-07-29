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

type Rule =
  | { re: RegExp; reason: string; blocking: boolean }
  | { custom: 'rm-recursive-force'; reason: string; blocking: boolean };

/**
 * `rm` çağrısında recursive VE force bayrakları AYRI AYRI verilmiş mi?
 * (rm -rf · rm -r -f · rm --recursive --force · rm -fr — hepsi yakalanır)
 */
function hasRecursiveForceRm(text: string): boolean {
  for (const m of text.matchAll(/\brm\b((?:\s+(?:-{1,2}[\w-]+))+)/gi)) {
    const flags = m[1]!;
    const recursive = /(^|\s)-{1,2}(recursive\b|[a-zA-Z]*[rR][a-zA-Z]*(\s|$))/.test(flags);
    const force = /(^|\s)-{1,2}(force\b|[a-zA-Z]*f[a-zA-Z]*(\s|$))/.test(flags);
    if (recursive && force) return true;
  }
  return false;
}

const RULES: Rule[] = [
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
  // rm: bayraklar AYRIK da olabilir (rm -r -f, rm --recursive --force) — tek
  // regex yerine "rm sonrası bayrak dizisinde recursive VE force var mı" kuralı.
  { custom: 'rm-recursive-force', reason: 'yıkıcı komut (rm -rf)', blocking: true },
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, reason: 'fork bomb', blocking: true },
  {
    // macOS ham aygıt (/dev/rdiskN), sd/nvme/hd/vd; dd of= ve > /dev/ yönlendirmesi
    re: /\bmkfs(\.\w+)?\b|\bdd\s+[^|\n]*of=\/dev\/r?(sd|nvme|disk|hd|vd)|>\s*\/dev\/r?(sd|nvme|disk|hd|vd)\w*\b|\bdiskutil\s+(erase(Disk|Volume)|partitionDisk)\b/i,
    reason: 'disk biçimlendirme/üzerine yazma',
    blocking: true,
  },
  { re: /\bchmod\s+(-[a-zA-Z]+\s+)*0?777\s+\//, reason: 'kök dizinde 777 izni', blocking: true },
  {
    // boru: curl/wget → (sudo) sh|bash|zsh|ksh|dash|fish|python|perl|ruby|node
    re: /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+(-\S+\s+)*)?(ba|z|k|da)?sh\b|\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+(-\S+\s+)*)?(fish|python[23]?|perl|ruby|node)\b/i,
    reason: 'doğrulanmamış uzak script’i doğrudan kabuğa boru (curl|sh)',
    blocking: true,
  },
  {
    // komut ikamesi / process substitution: sh -c "$(curl ...)" · bash <(curl ...)
    re: /(\$\(|<\()\s*(curl|wget)\b/i,
    reason: 'uzak script komut-ikamesiyle çalıştırılıyor ($(curl ...) / <(curl ...))',
    blocking: true,
  },
  {
    // gizleme: base64 -d | sh, echo ... | base64 --decode | bash, eval $(...)
    re: /\bbase64\b[^|\n]*(-d|--decode)[^|\n]*\|\s*(sudo\s+)?\w*sh\b|\beval\s*[("']*\s*\$\(/i,
    reason: 'gizlenmiş komut çalıştırma (base64/eval)',
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
    const hit = 'custom' in r ? hasRecursiveForceRm(text) : r.re.test(text);
    if (hit) out.push({ reason: r.reason, blocking: r.blocking });
  }
  return out;
}

/** Paylaşıma/eklemeye engel olan bulgular (fail-closed kapı). */
export function blockingFindings(text: string): SafetyFinding[] {
  return scanHarmful(text).filter((f) => f.blocking);
}
