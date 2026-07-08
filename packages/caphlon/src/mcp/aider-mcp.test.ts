/**
 * Aider MCP köprüsü protokol testleri — handleMessage saf katmanı.
 * (Gerçek aider koşusu makine/ağ ister; burada yalnız protokol sözleşmesi
 * kilitlenir. Şekiller, OpenCode ile çalıştığı kanıtlı egos MCP sunucusunun
 * aynasıdır.)
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { handleMessage } from './aider-mcp.js';

test('initialize: istenen protokol sürümü destekleniyorsa aynen döner', () => {
  const resp = handleMessage({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  }) as any;
  assert.equal(resp.result.protocolVersion, '2024-11-05');
  assert.equal(resp.result.serverInfo.name, 'caphlon-aider');
  assert.ok(resp.result.capabilities.tools);
});

test('initialize: bilinmeyen sürümde en yeni desteklenen döner', () => {
  const resp = handleMessage({
    jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' },
  }) as any;
  assert.equal(resp.result.protocolVersion, '2025-06-18');
});

test('bildirimler (id yok) cevap üretmez', () => {
  assert.equal(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('tools/list: aider_edit tek araç, task zorunlu', () => {
  const resp = handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) as any;
  const tools = resp.result.tools;
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'aider_edit');
  assert.deepEqual(tools[0].inputSchema.required, ['task']);
});

test('tools/call: bilinmeyen araç -32602', () => {
  const resp = handleMessage({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'yok_boyle' },
  }) as any;
  assert.equal(resp.error.code, -32602);
});

test('tools/call: task eksikse protokol hatası değil, isError sonuç döner', () => {
  const resp = handleMessage({
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'aider_edit', arguments: {} },
  }) as any;
  assert.equal(resp.result.isError, true);
  assert.match(resp.result.content[0].text, /task/);
});

test('bilinmeyen metod -32601', () => {
  const resp = handleMessage({ jsonrpc: '2.0', id: 6, method: 'resources/list' }) as any;
  assert.equal(resp.error.code, -32601);
});
