/**
 * config/providers — sağlayıcı kataloğu / model-ref çözümleme testleri.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProvider, resolveModelRef, PROVIDERS } from './providers.js';

test('getProvider — bilinen id (büyük/küçük harf duyarsız)', () => {
  assert.equal(getProvider('anthropic')?.name, 'Anthropic');
  assert.equal(getProvider('ANTHROPIC')?.name, 'Anthropic');
});

test('getProvider — bilinmeyen id için undefined döner', () => {
  assert.equal(getProvider('does-not-exist'), undefined);
});

test('her sağlayıcının en az bir modeli var, ilk model varsayılan sayılır', () => {
  for (const p of PROVIDERS) {
    assert.ok(p.models.length > 0, `${p.id} en az bir model içermeli`);
  }
});

test('resolveModelRef — sadece provider verilirse ilk (varsayılan) modeli seçer', () => {
  const r = resolveModelRef('anthropic');
  assert.equal(r?.provider.id, 'anthropic');
  assert.equal(r?.model, PROVIDERS.find((p) => p.id === 'anthropic')!.models[0]!.id);
});

test('resolveModelRef — provider/model çözümlenir', () => {
  const r = resolveModelRef('openai/gpt-4o-mini');
  assert.equal(r?.provider.id, 'openai');
  assert.equal(r?.model, 'gpt-4o-mini');
});

test('resolveModelRef — model id kendi içinde "/" içerebilir (openrouter vendor path)', () => {
  const r = resolveModelRef('openrouter/anthropic/claude-opus-4-8');
  assert.equal(r?.provider.id, 'openrouter');
  assert.equal(r?.model, 'anthropic/claude-opus-4-8');
});

test('resolveModelRef — bilinmeyen sağlayıcı için null döner', () => {
  assert.equal(resolveModelRef('does-not-exist/model'), null);
});

test('needsKey:false sağlayıcılar (ollama, opencode zen) defaultKey/anahtarsız çalışabilir', () => {
  const ollama = getProvider('ollama')!;
  assert.equal(ollama.needsKey, false);
  const zen = getProvider('opencode')!;
  assert.equal(zen.needsKey, false);
  assert.equal(zen.defaultKey, 'public');
});
