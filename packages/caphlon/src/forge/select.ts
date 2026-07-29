/**
 * Caphlon Forge — kanıt-kapılı aday seçimi (saf çekirdek).
 *
 * Caphlon'un diğer kod CLI'larından ayrıldığı yer burası. Onlar kodu yazıp
 * verir; kalite kontrolü ya modelin kendi görüşüdür ya da kullanıcının sonradan
 * test çalıştırmasıdır. Forge'da sıra tersine döner:
 *
 *   1. KANIT ELER — projenin gerçek doğrulama komutları koşar. Zorunlu bir
 *      kontrolü geçemeyen aday yarış dışıdır; hiçbir model görüşü onu kurtaramaz.
 *   2. YARGI SEÇER — yalnız KANITLANMIŞ çalışan adaylar arasından, bağımsız
 *      judge modeli seçer (üretici kendi işini onaylayamaz).
 *   3. DETERMİNİSTİK TIE-BREAK — judge yoksa/başarısızsa: önce daha az
 *      uyarı/başarısız opsiyonel kontrol, sonra daha KÜÇÜK diff (asgari
 *      değişiklik ilkesi: aynı testi geçen iki çözümden sade olan yeğlenir).
 *
 * Bu dosya saftır — süreç çalıştırmaz, dosya okumaz; girdi kanıt, çıktı karar.
 */

export interface CheckResult {
  label: string;
  passed: boolean;
  essential: boolean;
  /** Başarısızlıkta çıktının anlamlı sonu (judge'a ve kullanıcıya kanıt) */
  detail?: string;
}

export interface CandidateEvidence {
  id: string;
  /** Aday gerçekten dosya değiştirdi mi (boş çıktı = başarısızlık) */
  changed: boolean;
  /** Diff büyüklüğü — eşitlikte sadelik lehine tie-break */
  diffSize: number;
  checks: CheckResult[];
  /** Aider/araç düzeyinde çalıştırma hatası (süreç çöktü vb.) */
  error?: string;
}

export type Elimination = 'no-change' | 'tool-error' | 'failed-essential';

export interface Verdict {
  survivors: CandidateEvidence[];
  eliminated: { id: string; reason: Elimination; detail?: string }[];
  /** Judge'a gerek var mı (birden fazla hayatta kalan) */
  needsJudge: boolean;
  /** Judge yoksa/başarısızsa uygulanacak deterministik kazanan */
  fallbackWinner: CandidateEvidence | null;
}

/** Zorunlu kontrollerin hepsi geçti mi? */
export function passedEssentials(c: CandidateEvidence): boolean {
  return c.checks.filter((k) => k.essential).every((k) => k.passed);
}

function failedOptionalCount(c: CandidateEvidence): number {
  return c.checks.filter((k) => !k.essential && !k.passed).length;
}

/**
 * Kanıt kapısı: elemeyi yap, hayatta kalanları sırala.
 * Sıralama (fallback kazanan = ilk sıra): az başarısız-opsiyonel → küçük diff → id.
 */
export function gate(candidates: CandidateEvidence[]): Verdict {
  const eliminated: Verdict['eliminated'] = [];
  const survivors: CandidateEvidence[] = [];

  for (const c of candidates) {
    if (c.error) {
      eliminated.push({ id: c.id, reason: 'tool-error', detail: c.error });
      continue;
    }
    if (!c.changed) {
      eliminated.push({ id: c.id, reason: 'no-change' });
      continue;
    }
    if (!passedEssentials(c)) {
      const failed = c.checks.filter((k) => k.essential && !k.passed);
      eliminated.push({
        id: c.id,
        reason: 'failed-essential',
        detail: failed.map((f) => f.label).join(', '),
      });
      continue;
    }
    survivors.push(c);
  }

  survivors.sort((a, b) => {
    const fo = failedOptionalCount(a) - failedOptionalCount(b);
    if (fo !== 0) return fo;
    if (a.diffSize !== b.diffSize) return a.diffSize - b.diffSize; // sadelik yeğ
    return a.id.localeCompare(b.id); // deterministik
  });

  return {
    survivors,
    eliminated,
    needsJudge: survivors.length > 1,
    fallbackWinner: survivors[0] ?? null,
  };
}

/**
 * Judge'a gidecek kanıt özeti. Judge'ın ELİNDE yalnız çalışan adaylar olur —
 * "hangisi daha iyi?" sorusu, "hangisi çalışıyor?" sorusundan SONRA sorulur.
 */
export function judgePrompt(task: string, survivors: CandidateEvidence[], diffs: Record<string, string>): string {
  const blocks = survivors
    .map((s, i) => {
      const warn = s.checks.filter((k) => !k.essential && !k.passed).map((k) => k.label);
      return (
        `### Aday ${i + 1} (id: ${s.id})\n` +
        `Doğrulama: TÜM zorunlu kontroller GEÇTİ` +
        (warn.length ? ` · opsiyonel uyarı: ${warn.join(', ')}` : '') +
        ` · diff ${s.diffSize} satır\n\n` +
        '```diff\n' +
        (diffs[s.id] ?? '(diff yok)').slice(0, 6000) +
        '\n```'
      );
    })
    .join('\n\n');

  return (
    'Aşağıdaki adayların HEPSİ projenin gerçek testlerinden geçti — yani hepsi ÇALIŞIYOR.\n' +
    'Senin işin çalışıp çalışmadığına karar vermek DEĞİL; hangisinin daha iyi bir çözüm\n' +
    'olduğuna karar vermek. Ölçütler, önem sırasıyla:\n' +
    '1. Doğruluk ve kenar durumları (testlerin kapsamadığı hatalar)\n' +
    '2. Çevredeki kodun stiline ve mimarisine uyum\n' +
    '3. Sadelik — gereksiz soyutlama/kod eklemeyen\n' +
    '4. Kapsam disiplini — istenmeyen dosyalara dokunmamış olan\n\n' +
    `## Görev\n${task}\n\n${blocks}\n\n` +
    'YALNIZCA kazananın id değerini tek satırda yaz (başka hiçbir şey yazma).'
  );
}

/** Judge yanıtından id çıkar; tanınmazsa null (çağıran fallback'e düşer). */
export function parseJudgeChoice(reply: string, survivors: CandidateEvidence[]): string | null {
  const text = reply.trim();
  for (const s of survivors) {
    if (new RegExp(`\\b${s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) return s.id;
  }
  // "Aday 2" gibi cevaplar
  const m = /aday\s*([0-9]+)|candidate\s*([0-9]+)|^\s*([0-9]+)\s*$/i.exec(text);
  const n = m ? parseInt(m[1] ?? m[2] ?? m[3] ?? '', 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= survivors.length) return survivors[n - 1]!.id;
  return null;
}
