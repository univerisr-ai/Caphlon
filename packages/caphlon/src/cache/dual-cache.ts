/**
 * Caphlon — Çift Cache (token tasarruf sistemi çekirdeği).
 *
 * Project-egos-opt'un ÖLÇÜLMÜŞ mimarisinin Caphlon'a uyarlanması (egos kodu
 * dahil edilmez; desen zaten Caphlon'un hive_cache.py'sinden doğmuştu, burada
 * olgunlaşmış hali kendi katmanımız olarak kurulur):
 *
 *  - KİŞİSEL / TEKNİK ayrımı: her kayıt kişisel doğar; teknik havuz yalnız
 *    açık istekle (scope="technical"). Kişisel cache ASLA paylaşılmaz.
 *  - borrow → report yaşam döngüsü: ödünç alınan çözüm işe yaradıysa "worked"
 *    (güven artar, tasarruf sayılır), yaramadıysa "failed"+düzeltme (çıktı
 *    güncellenir, versiyon artar) — çalışmayan bilgi havuzu zehirleyemez.
 *  - Sır kapısı: teknik havuza yazılmadan önce içerik taranır; anahtar/token
 *    deseni bulunursa kayıt REDDEDİLİR (çağıran maskeleyip yeniden dener).
 *  - est_tokens_saved: dürüst tasarruf ölçümü — egos simulate modelinin
 *    muhafazakâr ucu: sıfırdan çözüm ≈ çıktı_token × 3 (output), ödünç ≈
 *    çıktıyı input olarak okumak; tasarruf = fark.
 *
 * Depolama: node:sqlite (Node 22.13+/23.4+ yerleşik — sıfır bağımlılık).
 * Yoksa katman kendini dürüstçe devre dışı bırakır (available() = false).
 * Konum: $CAPHLON_HOME/cache/{personal,technical}.db
 *
 * Benzerlik: hive_cache.py ile AYNI token-Jaccard (eşik 0.72) — iki katman
 * ileride Kovan koordinatörü üzerinden şema dönüşümsüz konuşabilsin diye.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { caphlonHome } from '../config/store.js';

// node:sqlite: Node 22.13+/23.4+ yerleşik. Eski Node'da modül yok — katman
// kapalı kalır, CLI'nın geri kalanı etkilenmez.
let DatabaseSync: any = null;
try {
  ({ DatabaseSync } = (await import('node:sqlite')) as any);
} catch {
  DatabaseSync = null;
}

export const JACCARD_THRESHOLD = 0.72; // hive_cache.py ile aynı

const WORD = /[a-z0-9çğıöşü]+/gi;

// Soru/işlev kelimeleri benzerliği sulandırır ("nasıl çözülür" vs "çözümü
// nedir" aynı problemdir). egos bunun için hibrit aramaya geçti; v1'de ucuz
// ve deterministik karşılığı: stopword eleme + içerik-kelime Jaccard'ı.
const STOPWORDS = new Set([
  // tr
  'nasıl', 'nedir', 'neden', 'niçin', 'hangi', 'için', 'gibi', 'ile', 've', 'veya',
  'bir', 'bu', 'şu', 'da', 'de', 'ki', 'en', 'ne', 'mi', 'mı', 'mu', 'mü', 'ben', 'sen',
  // en
  'how', 'what', 'why', 'which', 'the', 'a', 'an', 'is', 'are', 'to', 'of', 'and',
  'or', 'for', 'with', 'in', 'on', 'do', 'does', 'can', 'i',
]);

export function tokenize(text: string): Set<string> {
  const all = (text.toLowerCase().match(WORD) ?? []).map(String);
  const content = all.filter((t) => !STOPWORDS.has(t));
  // Tamamı stopword ise (kısa/garip sorgu) eleme yapma — boş kümeyle eşleşme olmaz.
  return new Set(content.length ? content : all);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/**
 * Benzerlik = max(Jaccard, containment). Containment (kesişim / küçük küme)
 * kısa parafraz sorguların uzun kayıtların alt kümesi olduğu gerçek durumu
 * yakalar — egos'un hibrit aramaya geçme sebebinin ucuz karşılığı. Aşırı
 * eşleşmeye karşı fren: containment yalnız iki taraf da ≥4 içerik kelimesiyse
 * devreye girer (1-2 kelimelik sorgu her şeye "benzemesin").
 */
export function similarity(a: Set<string>, b: Set<string>): number {
  const j = jaccard(a, b);
  if (a.size < 4 || b.size < 4) return j;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const containment = inter / Math.min(a.size, b.size);
  return Math.max(j, containment);
}

/** ~4 karakter ≈ 1 token (kaba ama deterministik). */
export function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Sır kapısı — denetim/egos'la aynı desen ailesi. Bulgu = teknik kayda RED.
const SECRET_PATTERNS: [string, RegExp][] = [
  ['anthropic key', /sk-ant-[A-Za-z0-9-]{8,}/],
  ['openrouter key', /sk-or-v1-[A-Za-z0-9]{8,}/],
  ['openai-tarzı key', /sk-[A-Za-z0-9]{20,}/],
  ['groq key', /gsk_[A-Za-z0-9]{16,}/],
  ['xai key', /xai-[A-Za-z0-9]{16,}/],
  ['aws key', /AKIA[0-9A-Z]{16}/],
  ['github token', /(ghp_|github_pat_)[A-Za-z0-9_]{16,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer', /Bearer\s+[A-Za-z0-9._-]{20,}/],
];

export function scanSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export interface BorrowHit {
  entryId: string;
  instruction: string;
  output: string;
  similarity: number;
  workedCount: number;
  failedCount: number;
}

export interface CacheStats {
  personal: number;
  technical: number;
  borrows: number;
  worked: number;
  failed: number;
  estTokensSaved: number;
}

export class DualCache {
  private dir: string;
  private dbs: Record<'personal' | 'technical', any> = { personal: null, technical: null };

  constructor(baseDir?: string) {
    this.dir = baseDir ?? join(caphlonHome(), 'cache');
  }

  static available(): boolean {
    return DatabaseSync !== null;
  }

  private db(scope: 'personal' | 'technical'): any {
    if (!DatabaseSync) throw new Error('node:sqlite yok (Node 22.13+/23.4+ gerekir)');
    if (!this.dbs[scope]) {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      const d = new DatabaseSync(join(this.dir, `${scope}.db`));
      d.exec(`
        CREATE TABLE IF NOT EXISTS solutions (
          entry_id   TEXT PRIMARY KEY,
          version    INTEGER NOT NULL DEFAULT 1,
          instruction TEXT NOT NULL,
          output     TEXT NOT NULL,
          tokens     TEXT NOT NULL,
          tags       TEXT NOT NULL DEFAULT '{}',
          status     TEXT NOT NULL DEFAULT 'verified',
          hits       INTEGER NOT NULL DEFAULT 0,
          worked_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id TEXT NOT NULL,
          action TEXT NOT NULL,
          detail TEXT,
          at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
      `);
      this.dbs[scope] = d;
    }
    return this.dbs[scope];
  }

  private bump(scope: 'personal' | 'technical', key: string, by: number): void {
    this.db(scope)
      .prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + ?')
      .run(key, by, by);
  }

  private metaVal(scope: 'personal' | 'technical', key: string): number {
    const row = this.db(scope).prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: number }
      | undefined;
    return row?.value ?? 0;
  }

  /**
   * Kayıt. Her kayıt KİŞİSEL doğar; teknik havuz yalnız açık scope ile.
   * Teknik kayıtta sır kapısı çalışır — bulgu varsa Error fırlatır (çağıran
   * maskeleyip yeniden dener; egos isError sözleşmesinin karşılığı).
   */
  record(
    instruction: string,
    output: string,
    scope: 'personal' | 'technical' = 'personal',
  ): string {
    if (scope === 'technical') {
      const found = scanSecrets(instruction + '\n' + output);
      if (found.length) {
        throw new Error(
          `sır kapısı: paylaşılabilir kayıtta gizli anahtar deseni bulundu (${found.join(', ')}). ` +
            'Sırları maskeleyip yeniden dene — kişisel kayıt (scope=personal) taranmaz.',
        );
      }
    }
    const now = Date.now();
    const id = randomUUID();
    const toks = JSON.stringify([...tokenize(instruction)]);
    this.db(scope)
      .prepare(
        'INSERT INTO solutions (entry_id, instruction, output, tokens, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, instruction, output, toks, now, now);
    this.db(scope).prepare('INSERT INTO history (entry_id, action, at) VALUES (?, ?, ?)').run(id, 'created', now);
    return id;
  }

  /**
   * Ödünç alma: önce teknik, sonra kişisel havuzda Jaccard araması.
   * İsabette hits+1 ve borrow sayacı işlenir; tasarruf report(worked)'te sayılır.
   */
  borrow(instruction: string): (BorrowHit & { scope: 'personal' | 'technical' }) | null {
    if (!DualCache.available()) return null;
    const q = tokenize(instruction);
    for (const scope of ['technical', 'personal'] as const) {
      const rows = this.db(scope)
        .prepare("SELECT entry_id, instruction, output, tokens, worked_count, failed_count FROM solutions WHERE status = 'verified'")
        .all() as any[];
      let best: BorrowHit | null = null;
      for (const r of rows) {
        const sim = similarity(q, new Set(JSON.parse(r.tokens)));
        if (sim >= JACCARD_THRESHOLD && (!best || sim > best.similarity)) {
          best = {
            entryId: r.entry_id,
            instruction: r.instruction,
            output: r.output,
            similarity: sim,
            workedCount: r.worked_count,
            failedCount: r.failed_count,
          };
        }
      }
      if (best) {
        this.db(scope).prepare('UPDATE solutions SET hits = hits + 1 WHERE entry_id = ?').run(best.entryId);
        this.bump(scope, 'borrows', 1);
        return { ...best, scope };
      }
    }
    return null;
  }

  /**
   * Rapor — ödünç döngüsünün ZORUNLU kapanışı.
   * worked: güven +1, tasarruf sayılır (çıktı×3 output yerine çıktı input okundu).
   * failed + correction: çıktı düzeltilir, versiyon artar (yerel tek kullanıcı =
   * sahibi biziz; quorum Kovan paylaşımına, Faz 2'ye ait).
   */
  report(entryId: string, worked: boolean, correction?: string): { ok: boolean; detail: string } {
    for (const scope of ['technical', 'personal'] as const) {
      const row = this.db(scope)
        .prepare('SELECT entry_id, output FROM solutions WHERE entry_id = ?')
        .get(entryId) as { entry_id: string; output: string } | undefined;
      if (!row) continue;
      const now = Date.now();
      if (worked) {
        this.db(scope)
          .prepare('UPDATE solutions SET worked_count = worked_count + 1, updated_at = ? WHERE entry_id = ?')
          .run(now, entryId);
        // Tasarruf: sıfırdan üretim ≈ out×3 output token; ödünç ≈ out×1 input.
        const saved = Math.max(0, estTokens(row.output) * 3 - estTokens(row.output));
        this.bump(scope, 'est_tokens_saved', saved);
        this.bump(scope, 'worked', 1);
        this.db(scope).prepare('INSERT INTO history (entry_id, action, at) VALUES (?, ?, ?)').run(entryId, 'worked', now);
        return { ok: true, detail: `teşekkürler — güven arttı, ~${Math.max(0, estTokens(row.output) * 2)} token tasarruf sayıldı` };
      }
      this.bump(scope, 'failed', 1);
      if (correction && correction.trim()) {
        if (scope === 'technical') {
          const found = scanSecrets(correction);
          if (found.length) {
            return { ok: false, detail: `sır kapısı: düzeltmede gizli anahtar deseni var (${found.join(', ')}) — maskeleyip yeniden dene` };
          }
        }
        this.db(scope)
          .prepare('UPDATE solutions SET output = ?, version = version + 1, failed_count = failed_count + 1, updated_at = ? WHERE entry_id = ?')
          .run(correction, now, entryId);
        this.db(scope)
          .prepare('INSERT INTO history (entry_id, action, detail, at) VALUES (?, ?, ?, ?)')
          .run(entryId, 'corrected', correction.slice(0, 200), now);
        return { ok: true, detail: 'düzeltme uygulandı (versiyon artırıldı) — sonraki ödünçler düzeltilmiş halini alır' };
      }
      this.db(scope)
        .prepare('UPDATE solutions SET failed_count = failed_count + 1, updated_at = ? WHERE entry_id = ?')
        .run(now, entryId);
      this.db(scope).prepare('INSERT INTO history (entry_id, action, at) VALUES (?, ?, ?)').run(entryId, 'failed', now);
      return { ok: true, detail: 'işlendi — düzeltmen varsa correction ile gönder, havuz temiz kalsın' };
    }
    return { ok: false, detail: `kayıt bulunamadı: ${entryId}` };
  }

  stats(): CacheStats {
    const count = (s: 'personal' | 'technical') =>
      (this.db(s).prepare('SELECT COUNT(*) AS n FROM solutions').get() as { n: number }).n;
    const m = (k: string) => this.metaVal('personal', k) + this.metaVal('technical', k);
    return {
      personal: count('personal'),
      technical: count('technical'),
      borrows: m('borrows'),
      worked: m('worked'),
      failed: m('failed'),
      estTokensSaved: m('est_tokens_saved'),
    };
  }

  close(): void {
    for (const s of ['personal', 'technical'] as const) {
      try {
        this.dbs[s]?.close();
      } catch {
        /* kapanışta hata yut */
      }
      this.dbs[s] = null;
    }
  }
}
