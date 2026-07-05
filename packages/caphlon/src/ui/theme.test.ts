/**
 * ui/theme testleri. Test koşucusunda stdout pipe'tır (isTTY yok) →
 * renkler deterministik olarak kapalıdır; düz metin doğrulanır.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { heading, kv, panel } from './theme.js';

test('panel: başlık üst kenara gömülü, satırlar │ ile, alt kenar ╰ ile', () => {
  const out = panel('🔌 LLM', ['birinci', 'ikinci']);
  const lines = out.split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0]!, /^╭─ 🔌 LLM ─+$/);
  assert.equal(lines[1], '│ birinci');
  assert.equal(lines[2], '│ ikinci');
  assert.match(lines[3]!, /^╰─+$/);
});

test('heading: tek satır, başlık ve çizgi', () => {
  assert.match(heading('Caphlon — System Status'), /^── Caphlon — System Status ─+$/);
});

test('kv: etiket sabit genişliğe yaslanır', () => {
  assert.equal(kv('Sync', 'yok'), 'Sync      yok');
  assert.equal(kv('API key', '✅ set'), 'API key   ✅ set');
});

test('TTY değilken çıktıda ANSI kaçış dizisi bulunmaz', () => {
  const out = panel('Başlık', [kv('A', 'b')]) + heading('x');
  assert.doesNotMatch(out, /\x1b\[/);
});
