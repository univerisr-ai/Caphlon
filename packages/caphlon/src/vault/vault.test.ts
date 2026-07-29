/**
 * Kasa testleri — token verimliliğinin çekirdeği: ucuz indeks + gerektiğinde
 * açılan notlar. Asıl iddia (indeks tamamından çok daha ucuz) burada ÖLÇÜLÜR.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseNote, renderNote, renderIndex, extractLinks, slugify, searchNotes,
  expand, savings, estTokens, loadNotes, writeNote, writeIndexFile, type Note,
} from './vault.js';

const mk = (slug: string, title: string, hook: string, body = 'gövde', tags: string[] = []): Note => ({
  slug, title, hook, tags, body, links: extractLinks(body),
});

test('slugify: Türkçe harfler bağlantı anahtarında korunur (bozulmaz)', () => {
  assert.equal(slugify('Node ABI Tuzağı'), 'node-abi-tuzagi');
  assert.equal(slugify('Şişli Çiçek'), 'sisli-cicek');
});

test('frontmatter ayrıştırma + yeniden yazma yuvarlak turu', () => {
  const raw = renderNote({ slug: 'x', title: 'Veritabanı Seçimi', hook: 'neden SQLite', tags: ['karar'], body: 'SQLite (WAL). [[node-surumu]] ile ilgili.' });
  const n = parseNote('x', raw);
  assert.equal(n.title, 'Veritabanı Seçimi');
  assert.equal(n.hook, 'neden SQLite');
  assert.deepEqual(n.tags, ['karar']);
  assert.deepEqual(n.links, ['node-surumu']);
});

test('kanca yoksa gövdenin ilk anlamlı satırı kullanılır (indeks boş kalmaz)', () => {
  const n = parseNote('y', '# Başlık\n\nAsıl bilgi burada.\n');
  assert.equal(n.hook, 'Asıl bilgi burada.');
});

test('İNDEKS: not başına tek satır, alfabetik, bağlantı anahtarlı', () => {
  const idx = renderIndex([mk('b', 'Beta', 'ikinci'), mk('a', 'Alfa', 'birinci', 'g', ['karar'])]);
  const lines = idx.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^- \[\[a\]\] Alfa — birinci #karar$/);
  assert.match(lines[1]!, /^- \[\[b\]\] Beta — ikinci$/);
});

test('ÖLÇÜM: indeks, kasanın tamamından belirgin ucuz (asıl iddia)', () => {
  const notes = Array.from({ length: 10 }, (_, i) =>
    mk(`n${i}`, `Not ${i}`, `kısa kanca ${i}`, 'x'.repeat(2000)), // 10 × ~500 token gövde
  );
  const s = savings(notes);
  assert.ok(s.fullTokens > 4000, 'tam kasa büyük olmalı');
  assert.ok(s.indexTokens < 200, `indeks küçük olmalı, ölçülen: ${s.indexTokens}`);
  assert.ok(s.ratio > 0.9, `tasarruf %90+ olmalı, ölçülen: %${(s.ratio * 100).toFixed(0)}`);
  // Gerçek kullanım: indeks + 1 not okumak yine tamamından çok ucuz
  const indexPlusOne = s.indexTokens + estTokens(notes[0]!.body);
  assert.ok(indexPlusOne < s.fullTokens / 5);
});

test('arama: başlık/kanca eşleşmesi gövdeden ağır basar', () => {
  const notes = [
    mk('a', 'Node sürümü', 'Node 22 şart', 'derleme notları'),
    mk('b', 'Başka konu', 'başka', 'burada node kelimesi gövdede geçiyor'),
  ];
  // Başlık+kanca eşleşmesi (3 puan) gövde eşleşmesinden (1 puan) ağır basar
  assert.equal(searchNotes(notes, 'node sürümü')[0]!.slug, 'a');
  // Hiçbir terimi geçmeyen sorgu → boş
  assert.deepEqual(searchNotes(notes, 'uzay mekiği fırlatma'), []);
});

test('bağlantı takibi: follow=false tek not, true ise derinlik 1', () => {
  const notes = [mk('a', 'A', 'h', 'bkz [[b]]'), mk('b', 'B', 'h'), mk('c', 'C', 'h')];
  assert.deepEqual(expand(notes, 'a', false).map((n) => n.slug), ['a']);
  assert.deepEqual(expand(notes, 'a', true).map((n) => n.slug), ['a', 'b']);
  assert.deepEqual(expand(notes, 'yok', true), []);
});

test('disk: yaz → oku → INDEX.md üret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caphlon-vault-test-'));
  writeNote(dir, { slug: 'karar-1', title: 'Karar 1', hook: 'ilk karar', tags: ['x'], body: 'gövde [[karar-2]]' });
  const notes = loadNotes(dir);
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0]!.links, ['karar-2']);
  const idxPath = writeIndexFile(dir, notes);
  assert.ok(idxPath?.endsWith('INDEX.md'));
  // INDEX.md kasadan sayılmaz (kendini indekslemesin)
  assert.equal(loadNotes(dir).length, 1);
});
