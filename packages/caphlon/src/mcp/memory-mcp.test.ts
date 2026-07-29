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

test('initialize + tools/list: kasa + hafıza araçları, "önce indeks" talimatlı', () => {
  const init = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) as any;
  assert.equal(init.result.serverInfo.name, 'caphlon-memory');
  // Token verimliliğinin sözleşmesi talimatta açıkça yazmalı
  assert.match(init.result.instructions, /START with vault_index/);
  assert.match(init.result.instructions, /Never dump the whole vault/);
  const tools = (handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as any).result.tools;
  assert.deepEqual(
    tools.map((t: any) => t.name),
    ['vault_index', 'vault_read', 'vault_write', 'vault_search', 'memory_search', 'memory_write'],
  );
});

test('kasa uçtan uca: yaz → indeks (ucuz) → oku → bağlantı takibi', () => {
  const proj = mkdtempSync(join(tmpdir(), 'caphlon-vault-mcp-'));
  const prev = process.cwd();
  process.chdir(proj);
  try {
    assert.match(call('vault_index', {}).result.content[0].text, /Kasa boş/);

    call('vault_write', {
      title: 'Node surumu',
      hook: 'neden 22 sart',
      body: 'Qualixar better-sqlite3 icin Node 22 ister. Bkz [[derleme-tuzaklari]].',
    });
    call('vault_write', { title: 'Derleme tuzaklari', hook: 'ABI hatalari', body: 'ABI uyusmazliginda yeniden derle.' });

    const idx = call('vault_index', {}).result.content[0].text;
    assert.match(idx, /\[\[node-surumu\]\]/);
    assert.match(idx, /token/); // ölçüm satırı
    // İndeks, notların tamamından kısa olmalı (asıl iddia)
    const full = call('vault_read', { slug: 'node-surumu', follow_links: true }).result.content[0].text;
    assert.ok(idx.length < full.length * 2);
    assert.match(full, /Derleme tuzaklari/); // bağlantı takip edildi

    const one = call('vault_read', { slug: 'node-surumu' }).result.content[0].text;
    assert.doesNotMatch(one, /Derleme tuzaklari/); // takip kapalıyken sadece istenen not

    assert.match(call('vault_search', { query: 'node surumu' }).result.content[0].text, /node-surumu/);
    assert.equal(call('vault_read', { slug: 'yok-boyle' }).result.isError, true);
  } finally {
    process.chdir(prev);
  }
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
