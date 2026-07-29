/**
 * Caphlon Vault — Obsidian'sız "kasa": token verimli kalıcı bilgi katmanı.
 *
 * Fikir Obsidian'ın asıl kazandırdığı şey: bilgiyi TEK büyük dosyada değil,
 * birbirine `[[bağlantı]]` ile bağlı küçük notlarda tut; ajana önce UCUZ bir
 * indeks ver, o da yalnız gerekeni açsın. Kazanç buradan gelir:
 *
 *   tam kasa (her şeyi bağlama koy)   ~N token
 *   indeks + 1-2 ilgili not           ~N/10 token   ← aynı iş, onda bir maliyet
 *
 * Caphlon bunu Obsidian KURMADAN yapar — çünkü Obsidian sadece bir görüntüleyici;
 * asıl sistem düz markdown + frontmatter + wiki-link. (Yine de kasayı Obsidian'da
 * açmak istersen olduğu gibi çalışır: aynı format.)
 *
 * Bu dosya saf çekirdek: ayrıştırma, indeks üretimi, bağlantı çözümü, token
 * tahmini. Dosya sistemi işleri sonda, ince bir katman.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { caphlonHome } from '../config/store.js';

export interface Note {
  /** Dosya adı (uzantısız) — bağlantı anahtarı: [[slug]] */
  slug: string;
  title: string;
  /** İndekste görünen tek satırlık kanca (neden açayım?) */
  hook: string;
  tags: string[];
  body: string;
  /** Bu notun işaret ettiği diğer notlar */
  links: string[];
}

/** ~4 karakter ≈ 1 token (kaba ama deterministik — cache ile aynı ölçü). */
export function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** `Başlık` → `baslik` (Türkçe harf-duyarlı, bağlantı anahtarı için). */
export function slugify(title: string): string {
  const map: Record<string, string> = { ş: 's', ğ: 'g', ı: 'i', ö: 'o', ü: 'u', ç: 'c', İ: 'i' };
  return title
    .toLowerCase()
    .replace(/[şğıöüçİ]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** `[[bağlantı]]` hedeflerini çıkar. */
export function extractLinks(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)].map((m) => m[1]!.trim());
}

/** YAML-ish frontmatter + gövde ayrıştır (bağımlılık yok — üç alan yeter). */
export function parseNote(slug: string, raw: string): Note {
  let title = slug;
  let hook = '';
  let tags: string[] = [];
  let body = raw;

  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (fm) {
    body = raw.slice(fm[0].length);
    for (const line of fm[1]!.split('\n')) {
      const m = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      const [, key, val] = m;
      const clean = (val ?? '').replace(/^["']|["']$/g, '').trim();
      if (key === 'title') title = clean || slug;
      else if (key === 'hook') hook = clean;
      else if (key === 'tags') tags = clean.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  // Kanca yoksa gövdenin ilk anlamlı satırını kullan (indeks asla boş kalmasın).
  if (!hook) {
    const first = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    hook = (first ?? '').slice(0, 100);
  }
  return { slug, title, hook, tags, body: body.trim(), links: extractLinks(body) };
}

/** Notu diske yazılacak metne çevir (frontmatter + gövde). */
export function renderNote(n: Omit<Note, 'links'>): string {
  const tags = n.tags.length ? `\ntags: [${n.tags.join(', ')}]` : '';
  return `---\ntitle: ${n.title}\nhook: ${n.hook}${tags}\n---\n\n${n.body.trim()}\n`;
}

/**
 * UCUZ İNDEKS — kasanın tamamı yerine bağlama giren şey budur.
 * Satır başına bir not: başlık + kanca + etiketler. Ajan buradan seçer,
 * sonra yalnız seçtiğini `vault_read` ile açar.
 */
export function renderIndex(notes: Note[]): string {
  if (!notes.length) return '(kasa boş)';
  const lines = notes
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((n) => `- [[${n.slug}]] ${n.title} — ${n.hook}${n.tags.length ? ` #${n.tags.join(' #')}` : ''}`);
  return lines.join('\n');
}

/**
 * Tasarruf ölçümü (dürüst): indeksi okumak vs kasanın tamamını okumak.
 * İddia değil hesap — `caphlon vault stats` bunu gösterir.
 */
export function savings(notes: Note[]): { indexTokens: number; fullTokens: number; ratio: number } {
  const indexTokens = estTokens(renderIndex(notes));
  const fullTokens = notes.reduce((a, n) => a + estTokens(n.body), 0);
  return {
    indexTokens,
    fullTokens,
    ratio: fullTokens > 0 ? 1 - indexTokens / fullTokens : 0,
  };
}

/** Sorguyla eşleşen notlar (başlık/kanca/etiket ağırlıklı, gövde zayıf). */
export function searchNotes(notes: Note[], query: string, limit = 5): Note[] {
  const terms = (query.toLowerCase().match(/[a-z0-9çğıöşü]+/gi) ?? []).map((t) => t.toLowerCase());
  if (!terms.length) return [];
  return notes
    .map((n) => {
      const head = `${n.title} ${n.hook} ${n.tags.join(' ')}`.toLowerCase();
      const body = n.body.toLowerCase();
      const score = terms.reduce((a, t) => a + (head.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.n);
}

/** Bir notu, istenirse bağlantılı notlarıyla birlikte topla (derinlik 1). */
export function expand(notes: Note[], slug: string, follow: boolean): Note[] {
  const byslug = new Map(notes.map((n) => [n.slug, n]));
  const root = byslug.get(slug);
  if (!root) return [];
  if (!follow) return [root];
  const out = [root];
  for (const l of root.links) {
    const linked = byslug.get(l);
    if (linked && !out.includes(linked)) out.push(linked);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Disk katmanı (ince)
// ---------------------------------------------------------------------------

/** Proje kasası (varsa) ve global kasa. Proje önce gelir — yerel bilgi kazanır. */
export function vaultDirs(cwd = process.cwd()): { project: string; global: string } {
  return { project: join(cwd, '.caphlon', 'vault'), global: join(caphlonHome(), 'vault') };
}

export function loadNotes(dir: string): Note[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'INDEX.md')
    .map((f) => parseNote(f.replace(/\.md$/, ''), readFileSync(join(dir, f), 'utf8')));
}

/** İki kasayı birleştir (aynı slug varsa proje kazanır). */
export function loadAll(cwd = process.cwd()): Note[] {
  const { project, global } = vaultDirs(cwd);
  const p = loadNotes(project);
  const g = loadNotes(global).filter((n) => !p.some((x) => x.slug === n.slug));
  return [...p, ...g];
}

export function writeNote(dir: string, note: Omit<Note, 'links'>): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${note.slug}.md`);
  writeFileSync(path, renderNote(note));
  return path;
}

/** Kasanın kökündeki insan-okunur INDEX.md'yi tazele (Obsidian'da da görünür). */
export function writeIndexFile(dir: string, notes: Note[]): string | null {
  if (!existsSync(dir)) return null;
  const path = join(dir, 'INDEX.md');
  writeFileSync(path, `# Kasa İndeksi\n\n${renderIndex(notes)}\n`);
  return path;
}

/** Ev dizini kısaltması (çıktıda uzun yol basmamak için). */
export function short(p: string): string {
  return p.startsWith(homedir()) ? p.replace(homedir(), '~') : p;
}
