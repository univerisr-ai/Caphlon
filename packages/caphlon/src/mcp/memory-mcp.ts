/**
 * Caphlon — Kalıcı Hafıza MCP köprüsü (MiMo memory katmanı → sohbet aracı).
 *
 * MiMo Code'un hafızası (MEMORY.md dosyaları + memory_fts FTS5 indeksi) tam bir
 * TUI oturumunun içinde yaşıyordu; `caphlon` sohbetinden erişilemiyordu.
 * Bu köprü onu ARAÇ haline getirir: ajan "bu projede daha önce ne konuşmuştuk?"
 * sorusunu kendisi cevaplar, öğrendiğini kendisi yazar.
 *
 * No-rewrite: hafıza formatını biz icat etmiyoruz — MiMo'nun MEMORY.md
 * sözleşmesini ve (varsa) kendi FTS indeksini okuyoruz.
 *
 * Kaynaklar (sırayla):
 *   1. Proje MEMORY.md (çalışma dizini) — `caphlon init`'in kurduğu dosya
 *   2. MiMo memory_fts tablosu (indekslenmişse) — tam metin araması
 */

import { createInterface } from 'node:readline';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { projectRoot } from '../external.js';
import {
  loadAll, searchNotes, renderIndex, expand, writeNote, writeIndexFile,
  savings, slugify, vaultDirs, short, estTokens,
} from '../vault/vault.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

let DatabaseSync: any = null;
try {
  ({ DatabaseSync } = (await import('node:sqlite')) as any);
} catch {
  DatabaseSync = null;
}

const INSTRUCTIONS =
  'Persistent knowledge, token-efficiently. START with vault_index — it is a ' +
  'ONE-LINE-PER-NOTE map of everything known about this project (cheap). Then ' +
  'open ONLY the notes you need with vault_read. Never dump the whole vault ' +
  'into context; that is what the index exists to avoid. Use vault_write when a ' +
  'durable fact emerges (decision, convention, gotcha) — link related notes with ' +
  '[[slug]]. memory_search/memory_write remain for the flat MEMORY.md file.';

const TOOLS = [
  {
    name: 'vault_index',
    description:
      'START HERE for anything about this project you might already know. Returns a one-line-per-note map of the whole knowledge vault (cheap — a fraction of reading the notes). ' +
      'Pick the relevant slugs from it, then call vault_read. Do NOT guess or ask the user to repeat context before checking this.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'vault_read',
    description:
      'Read ONE note from the vault by its slug (from vault_index). Set follow_links=true to also pull the notes it links to ([[slug]]) — use sparingly, it costs more tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Note slug as shown in vault_index' },
        follow_links: { type: 'boolean', description: 'Also include directly linked notes (depth 1)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'vault_write',
    description:
      'Save a DURABLE fact as a vault note: a decision, convention, constraint or gotcha future sessions must know. ' +
      'Give a short title, a one-line hook (why would someone open this?), and a body. Link related notes inside the body with [[slug]]. ' +
      'Not for transient state, not for secrets.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        hook: { type: 'string', description: 'One line: why open this note?' },
        body: { type: 'string', description: 'The knowledge itself; link others with [[slug]]' },
        tags: { type: 'array', items: { type: 'string' } },
        global: { type: 'boolean', description: 'Save to the machine-wide vault instead of this project' },
      },
      required: ['title', 'hook', 'body'],
    },
  },
  {
    name: 'vault_search',
    description: 'Find notes by keywords when the index is long. Returns matching notes with their hooks — then vault_read the one you want.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'memory_search',
    description:
      'Search this project\'s persistent memory (MEMORY.md + MiMo memory index) before assuming or asking the user to repeat context. ' +
      'Use for: prior decisions, project conventions, known gotchas, "what did we do last time".',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keywords describing what you need to recall' } },
      required: ['query'],
    },
  },
  {
    name: 'memory_write',
    description:
      'Append a DURABLE fact to project memory (MEMORY.md): a decision, convention, constraint or gotcha future sessions must know. ' +
      'Keep it one or two lines. Do NOT use for transient state or secrets.',
    inputSchema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The durable fact, one or two lines' } },
      required: ['note'],
    },
  },
];

interface McpResult { content: { type: 'text'; text: string }[]; isError: boolean }
const textResult = (text: string, isError = false): McpResult => ({ content: [{ type: 'text', text }], isError });

/** MiMo veri evi (compose.ts mimoDataDir ile aynı mantık, bağımsız kopya). */
function mimoDataDir(): string | null {
  if (process.env.MIMOCODE_HOME) return join(process.env.MIMOCODE_HOME, 'data');
  const bundled = join(projectRoot(), 'MiMo-Code-main', '.dev-home', 'data');
  if (existsSync(bundled)) return bundled;
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  const p = join(xdg, 'mimocode');
  return existsSync(p) ? p : null;
}

function projectMemoryPath(): string {
  return join(process.cwd(), 'MEMORY.md');
}

/** Basit alaka: sorgu kelimelerinden en az biri geçen paragraflar (saf, testlenebilir). */
export function searchMarkdown(content: string, query: string, limit = 5): string[] {
  const terms = query.toLowerCase().match(/[a-z0-9çğıöşü]+/gi)?.map((t) => t.toLowerCase()) ?? [];
  if (!terms.length) return [];
  const blocks = content.split(/\n\s*\n/).filter((b) => b.trim());
  const scored = blocks
    .map((b) => {
      const lower = b.toLowerCase();
      return { b, score: terms.filter((t) => lower.includes(t)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.b.trim());
}

/** MiMo FTS indeksinde ara (indeks boşsa/yoksa sessizce boş döner). */
function searchFts(query: string, limit = 5): string[] {
  const dir = mimoDataDir();
  if (!DatabaseSync || !dir) return [];
  const db = join(dir, 'mimocode.db');
  if (!existsSync(db)) return [];
  try {
    const d = new DatabaseSync(db, { readOnly: true });
    try {
      const rows = d
        .prepare("SELECT path, body FROM memory_fts WHERE body LIKE ? LIMIT ?")
        .all(`%${query.split(/\s+/)[0] ?? ''}%`, limit) as { path: string; body: string }[];
      return rows.map((r) => `[${r.path}]\n${r.body.slice(0, 800)}`);
    } finally {
      d.close();
    }
  } catch {
    return [];
  }
}

function callTool(name: string, args: Record<string, unknown>): McpResult {
  // --- Kasa (token-verimli katman) ---
  if (name === 'vault_index') {
    const notes = loadAll();
    if (!notes.length) {
      return textResult(
        'Kasa boş — bu projede henüz kayıtlı bilgi yok. Kalıcı bir karar/kural/tuzak ' +
          'ortaya çıkarsa vault_write ile yaz (gelecek oturumlar sıfırdan başlamasın).',
      );
    }
    const s = savings(notes);
    return textResult(
      `${renderIndex(notes)}\n\n(${notes.length} not · indeks ~${s.indexTokens} token; ` +
        `tamamını okumak ~${s.fullTokens} token olurdu → yalnız gerekeni aç)`,
    );
  }
  if (name === 'vault_read') {
    const notes = loadAll();
    const picked = expand(notes, String(args.slug ?? ''), Boolean(args.follow_links));
    if (!picked.length) {
      return textResult(`Not bulunamadı: ${String(args.slug ?? '')} — güncel liste için vault_index çağır.`, true);
    }
    return textResult(
      picked.map((n) => `## ${n.title} [[${n.slug}]]\n${n.hook}\n\n${n.body}`).join('\n\n---\n\n'),
    );
  }
  if (name === 'vault_search') {
    const notes = loadAll();
    const hits = searchNotes(notes, String(args.query ?? ''));
    if (!hits.length) return textResult('Eşleşen not yok. vault_index ile tüm haritaya bakabilirsin.');
    return textResult(
      hits.map((n) => `- [[${n.slug}]] ${n.title} — ${n.hook}`).join('\n') +
        '\n\nİlgili olanı vault_read ile aç.',
    );
  }
  if (name === 'vault_write') {
    const title = String(args.title ?? '').trim();
    const hook = String(args.hook ?? '').trim();
    const body = String(args.body ?? '').trim();
    if (!title || !hook || !body) return textResult('hata: title, hook ve body zorunlu', true);
    const dirs = vaultDirs();
    const dir = args.global ? dirs.global : dirs.project;
    const slug = slugify(title);
    const path = writeNote(dir, {
      slug, title, hook, body,
      tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
    });
    writeIndexFile(dir, loadAll());
    return textResult(`kasaya yazıldı: ${short(path)} (slug: ${slug}) — indeks tazelendi`);
  }

  if (name === 'memory_search') {
    const q = String(args.query ?? '');
    const out: string[] = [];
    const mem = projectMemoryPath();
    if (existsSync(mem)) {
      const hits = searchMarkdown(readFileSync(mem, 'utf8'), q);
      if (hits.length) out.push(`## MEMORY.md (${mem})\n\n` + hits.join('\n\n---\n\n'));
    }
    const fts = searchFts(q);
    if (fts.length) out.push('## MiMo hafıza indeksi\n\n' + fts.join('\n\n---\n\n'));
    if (!out.length) {
      return textResult(
        'MISS — bu projede kayıtlı hafıza bulunamadı' +
          (existsSync(mem) ? '' : ' (MEMORY.md yok — `caphlon init` oluşturur).') +
          ' Kullanıcıdan bağlam iste ya da kodu incele; kalıcı bir karar çıkarsa memory_write ile yaz.',
      );
    }
    return textResult(out.join('\n\n'));
  }

  // memory_write
  const note = String(args.note ?? '').trim();
  if (!note) return textResult('hata: boş not yazılamaz', true);
  const mem = projectMemoryPath();
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    if (!existsSync(mem)) {
      writeFileSync(mem, `# Proje Hafızası\n\nKalıcı kararlar, kurallar ve tuzaklar (Caphlon).\n\n- (${stamp}) ${note}\n`);
      return textResult(`MEMORY.md oluşturuldu ve not eklendi: ${mem}`);
    }
    appendFileSync(mem, `- (${stamp}) ${note}\n`);
    return textResult(`kalıcı hafızaya yazıldı: ${mem}`);
  } catch (e) {
    return textResult(`hata: yazılamadı (${e instanceof Error ? e.message : String(e)})`, true);
  }
}

type Json = Record<string, unknown>;
const result = (id: unknown, res: unknown): Json => ({ jsonrpc: '2.0', id, result: res });
const rpcError = (id: unknown, code: number, message: string): Json => ({ jsonrpc: '2.0', id, error: { code, message } });

export function handleMessage(msg: Json): Json | null {
  if (!('id' in msg)) return null;
  const id = msg.id;
  const method = msg.method as string | undefined;
  const params = (msg.params ?? {}) as Json;
  if (method === 'initialize') {
    const requested = params.protocolVersion as string | undefined;
    const version = requested && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return result(id, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: 'caphlon-memory', version: '0.1.0' },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params.name as string | undefined;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32602, `bilinmeyen araç: ${name}`);
    const a = (params.arguments ?? {}) as Record<string, unknown>;
    // vault_index gibi argümansız araçlarda `required` yoktur — boş kabul et.
    for (const req of ((tool.inputSchema as any).required ?? []) as string[]) {
      if (!a[req]) return result(id, textResult(`hata: zorunlu argüman eksik: ${req}`, true));
    }
    return result(id, callTool(name!, a));
  }
  return rpcError(id, -32601, `bilinmeyen metod: ${method}`);
}

function serve(): void {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    let msg: unknown;
    try {
      msg = JSON.parse(t);
    } catch {
      process.stdout.write(JSON.stringify(rpcError(null, -32700, 'parse error')) + '\n');
      return;
    }
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
      process.stdout.write(JSON.stringify(rpcError(null, -32600, 'istek bir JSON nesnesi olmalı')) + '\n');
      return;
    }
    try {
      const resp = handleMessage(msg as Json);
      if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
    } catch (e) {
      process.stderr.write(`caphlon-memory-mcp hata: ${String(e)}\n`);
      process.stdout.write(JSON.stringify(rpcError((msg as Json).id ?? null, -32603, 'internal error')) + '\n');
    }
  });
}

const isMain = process.argv[1]?.endsWith('memory-mcp.js') || process.argv[1]?.endsWith('memory-mcp.ts');
if (isMain) serve();
