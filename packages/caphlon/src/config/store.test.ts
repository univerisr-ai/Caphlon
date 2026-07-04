/**
 * config/store — config + şifreli credential deposu testleri.
 *
 * İzole bir CAPHLON_HOME — gerçek ~/.caphlon'a dokunmaz.
 *
 * Çalıştır:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'caphlon-store-test-'));
process.env.CAPHLON_HOME = home;

const {
  loadConfig,
  saveConfig,
  setCredential,
  getCredential,
  removeCredential,
  connectedProviders,
  maskKey,
} = await import('./store.js');

test('loadConfig — dosya yoksa varsayılan (boş) config döner', () => {
  const cfg = loadConfig();
  assert.equal(cfg.activeProvider, null);
  assert.equal(cfg.activeModel, null);
  assert.deepEqual(cfg.providers, {});
});

test('saveConfig + loadConfig — round-trip', () => {
  saveConfig({
    activeProvider: 'anthropic',
    activeModel: 'claude-opus-4-8',
    providers: { anthropic: { model: 'claude-opus-4-8' } },
  });
  const cfg = loadConfig();
  assert.equal(cfg.activeProvider, 'anthropic');
  assert.equal(cfg.activeModel, 'claude-opus-4-8');
  assert.equal(cfg.providers.anthropic?.model, 'claude-opus-4-8');
});

test('config.json diskte düz metin JSON olarak durur (sır içermez)', () => {
  const raw = readFileSync(join(home, 'config.json'), 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('setCredential + getCredential — round-trip, şifreli saklanır', () => {
  setCredential('openai', 'sk-test-1234567890abcdef');
  assert.equal(getCredential('openai'), 'sk-test-1234567890abcdef');
  const raw = readFileSync(join(home, 'credentials.enc'), 'utf8');
  assert.equal(raw.includes('sk-test-1234567890abcdef'), false, 'anahtar diskte düz metin olmamalı');
});

test('connectedProviders — kayıtlı sağlayıcıları listeler', () => {
  setCredential('anthropic', 'sk-ant-abc');
  const providers = connectedProviders();
  assert.ok(providers.includes('openai'));
  assert.ok(providers.includes('anthropic'));
});

test('removeCredential — anahtarı siler, diğerlerini etkilemez', () => {
  removeCredential('openai');
  assert.equal(getCredential('openai'), null);
  assert.equal(getCredential('anthropic'), 'sk-ant-abc');
});

test('getCredential — hiç ayarlanmamış sağlayıcı için null döner', () => {
  assert.equal(getCredential('groq'), null);
});

test('maskKey — kısa anahtar ●●●● maskesi, uzun anahtar baş+son gösterir', () => {
  assert.equal(maskKey('short'), '••••');
  assert.equal(maskKey('sk-ant-1234567890abcdef'), 'sk-ant…cdef');
});

test.after(() => {
  rmSync(home, { recursive: true, force: true });
});
