/**
 * Cache MCP köprüsü protokol testleri (handleMessage saf katmanı).
 * Cache CAPHLON_HOME'a yazar — izolasyon için taze geçici ev.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CAPHLON_HOME = mkdtempSync(join(tmpdir(), 'caphlon-cachemcp-test-'));
const { handleMessage } = await import('./cache-mcp.js');

function call(name: string, args: Record<string, unknown>, id = 9): any {
  return handleMessage({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
}

test('initialize + tools/list: 4 araç, yaşam döngüsü talimatlı', () => {
  const init = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) as any;
  assert.equal(init.result.serverInfo.name, 'caphlon-cache');
  assert.match(init.result.instructions, /cache_borrow/);
  const tools = (handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as any).result.tools;
  assert.deepEqual(
    tools.map((t: any) => t.name),
    ['cache_borrow', 'cache_report', 'cache_contribute', 'cache_remember'],
  );
});

test('uçtan uca döngü: miss → contribute → hit → report worked', () => {
  const miss = call('cache_borrow', { instruction: 'pnpm store prune neden sıfır siliyor' });
  assert.match(miss.result.content[0].text, /MISS/);

  const c = call('cache_contribute', {
    instruction: 'pnpm store prune neden sıfır siliyor',
    output: 'Hardlink refcount hâlâ >0 ise store girdisi referanslı sayılır; önce node_modules sil.',
  });
  assert.equal(c.result.isError, false);

  const hit = call('cache_borrow', { instruction: 'pnpm store prune neden sıfır siliyor' });
  const text = hit.result.content[0].text;
  assert.match(text, /HIT/);
  const entryId = /entry_id: ([a-f0-9-]+)/.exec(text)![1];

  const rep = call('cache_report', { entry_id: entryId, worked: true });
  assert.equal(rep.result.isError, false);
  assert.match(rep.result.content[0].text, /tasarruf/);
});

test('sır kapısı: contribute reddedilir, isError metniyle (model maskeleyip tekrar dener)', () => {
  const r = call('cache_contribute', {
    instruction: 'anahtar nereye',
    output: 'ANTHROPIC_API_KEY=sk-ant-gizli12345678',
  });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /sır kapısı/);
});

test('cache_remember kişisel havuza yazar (sır taraması yok)', () => {
  const r = call('cache_remember', { instruction: 'benim notum', output: 'Bearer abcdefghijklmnopqrstuvwxyz' });
  assert.equal(r.result.isError, false);
  assert.match(r.result.content[0].text, /kişisel/);
});

test('eksik zorunlu argüman protokol hatası değil, isError sonuçtur', () => {
  const r = call('cache_report', { worked: true });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /entry_id/);
});

test('bilinmeyen araç -32602', () => {
  const r = handleMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'yok' } }) as any;
  assert.equal(r.error.code, -32602);
});
