/**
 * Hafıza köprüsü testleri (protokol + arama + yazma).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { handleMessage, searchMarkdown } = await import('./memory-mcp.js');

const call = (name: string, args: Record<string, unknown>, id = 9): any =>
  handleMessage({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('searchMarkdown: ilgili paragraf skorla döner, alakasız gelmez', () => {
  const md = `# Hafıza\n\n- (2026-01-01) Node 22 kullanılır, 24 better-sqlite3'ü kırar\n\n- (2026-01-02) Kek tarifi burada değil\n`;
  const hits = searchMarkdown(md, 'node sürüm better-sqlite3');
  assert.equal(hits.length, 1);
  assert.match(hits[0]!, /Node 22/);
  assert.deepEqual(searchMarkdown(md, 'tamamen alakasız uzay mekiği'), []);
});

test('initialize + tools/list: iki araç, hatırlama talimatlı', () => {
  const init = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) as any;
  assert.equal(init.result.serverInfo.name, 'caphlon-memory');
  assert.match(init.result.instructions, /memory_search/);
  const tools = (handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as any).result.tools;
  assert.deepEqual(tools.map((t: any) => t.name), ['memory_search', 'memory_write']);
});

test('memory_write → memory_search yuvarlak turu (geçici proje dizininde)', () => {
  const proj = mkdtempSync(join(tmpdir(), 'caphlon-mem-test-'));
  const prev = process.cwd();
  process.chdir(proj);
  try {
    const miss = call('memory_search', { query: 'veritabani secimi' });
    assert.match(miss.result.content[0].text, /MISS/);

    const w = call('memory_write', { note: 'Veritabani secimi: SQLite (WAL), Postgres degil — tek kullanici' });
    assert.equal(w.result.isError, false);
    assert.ok(existsSync(join(proj, 'MEMORY.md')));

    const hit = call('memory_search', { query: 'veritabani secimi' });
    assert.match(hit.result.content[0].text, /SQLite/);
    // tarih damgası eklenmiş olmalı
    assert.match(readFileSync(join(proj, 'MEMORY.md'), 'utf8'), /- \(\d{4}-\d{2}-\d{2}\)/);
  } finally {
    process.chdir(prev);
  }
});

test('boş not reddedilir, bilinmeyen araç -32602', () => {
  assert.equal(call('memory_write', { note: '   ' }).result.isError, true);
  const r = handleMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'yok' } }) as any;
  assert.equal(r.error.code, -32602);
});
