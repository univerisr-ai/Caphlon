/**
 * litellmParams saf eşleme testleri (denetim bulgusu: "saf — testlenebilir"
 * yorumu vardı, testi yoktu).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { litellmParams } from './llm.js';
import { getProvider } from './config/providers.js';
import type { ActiveModel } from './config/active.js';

function activeFor(providerId: string, model: string, baseUrl?: string): ActiveModel {
  const provider = getProvider(providerId)!;
  return { provider, model, apiKey: null, baseUrl: baseUrl ?? provider.baseUrl };
}

test('opencode (Zen) → openai/<model> + api_base + User-Agent', () => {
  const p = litellmParams(activeFor('opencode', 'big-pickle'));
  assert.equal(p.model, 'openai/big-pickle');
  assert.equal(p.apiBase, 'https://opencode.ai/zen/v1');
  assert.deepEqual(p.extraHeaders, { 'User-Agent': 'opencode/0.1' });
});

test('ollama → ollama/<model>, api_base /v1 soneki düşer', () => {
  const p = litellmParams(activeFor('ollama', 'llama3.2'));
  assert.equal(p.model, 'ollama/llama3.2');
  assert.equal(p.apiBase, 'http://localhost:11434');
});

test('bilinen sağlayıcı aider model-string eşlemesini aynen kullanır, varsayılan baseUrl geçilmez', () => {
  const p = litellmParams(activeFor('anthropic', 'claude-opus-4-8'));
  assert.equal(p.model, 'anthropic/claude-opus-4-8');
  assert.equal(p.apiBase, undefined);
  assert.equal(p.extraHeaders, undefined);
});

test('kullanıcı baseUrl override etmişse (proxy/self-host) litellm de onu görür', () => {
  const p = litellmParams(activeFor('anthropic', 'claude-opus-4-8', 'https://proxy.example/v1'));
  assert.equal(p.apiBase, 'https://proxy.example/v1');
});
