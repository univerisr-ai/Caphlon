/**
 * config/active — model-string eşleme + env enjeksiyonu testleri.
 *
 * getActiveModel() gerçek store'a bağlı olduğundan, saf eşleme fonksiyonlarını
 * (aiderModelString/opencodeModelString) senteik bir ActiveModel ile test eder.
 * activeModelEnv() için izole bir CAPHLON_HOME üzerinden gerçek connect akışı
 * kurulur (store.test.ts ile aynı desen).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getProvider } from './providers.js';

const home = mkdtempSync(join(tmpdir(), 'caphlon-active-test-'));
process.env.CAPHLON_HOME = home;

const { aiderModelString, opencodeModelString, activeModelEnv, getJudgeModel, judgeModelEnv } =
  await import('./active.js');
const { setCredential } = await import('./store.js');

function activeFor(providerId: string, model: string) {
  return { provider: getProvider(providerId)!, model, apiKey: 'sk-test', baseUrl: getProvider(providerId)!.baseUrl };
}

test('aiderModelString — anthropic/google/together özel namespace ister', () => {
  assert.equal(aiderModelString(activeFor('anthropic', 'claude-opus-4-8')), 'anthropic/claude-opus-4-8');
  assert.equal(aiderModelString(activeFor('google', 'gemini-2.0-flash')), 'gemini/gemini-2.0-flash');
  assert.equal(
    aiderModelString(activeFor('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo')),
    'together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo',
  );
});

test('aiderModelString — openai litellm varsayılan namespace (çıplak model)', () => {
  assert.equal(aiderModelString(activeFor('openai', 'gpt-4o')), 'gpt-4o');
});

test('aiderModelString — openrouter: model "openrouter/" önekini zaten taşıyorsa tekrar eklenmez', () => {
  assert.equal(aiderModelString(activeFor('openrouter', 'openrouter/auto')), 'openrouter/auto');
});

test('aiderModelString — openrouter: düz vendor-path model "openrouter/" ile öneklenir', () => {
  assert.equal(
    aiderModelString(activeFor('openrouter', 'anthropic/claude-opus-4-8')),
    'openrouter/anthropic/claude-opus-4-8',
  );
});

test('aiderModelString — bilinmeyen sağlayıcılar (groq, deepseek, ollama) "<provider>/<model>"', () => {
  assert.equal(aiderModelString(activeFor('groq', 'llama-3.3-70b-versatile')), 'groq/llama-3.3-70b-versatile');
  assert.equal(aiderModelString(activeFor('deepseek', 'deepseek-chat')), 'deepseek/deepseek-chat');
});

test('opencodeModelString — openai dahil HER sağlayıcı namespace\'lenir (aider\'dan farkı)', () => {
  assert.equal(opencodeModelString(activeFor('openai', 'gpt-4o')), 'openai/gpt-4o');
  assert.equal(opencodeModelString(activeFor('anthropic', 'claude-opus-4-8')), 'anthropic/claude-opus-4-8');
});

test('opencodeModelString — openrouter vendor-path korunur, tekrar önek eklenmez', () => {
  assert.equal(opencodeModelString(activeFor('openrouter', 'openrouter/auto')), 'openrouter/auto');
});

test('activeModelEnv — aktif model yoksa boş obje döner', () => {
  assert.deepEqual(activeModelEnv(), {});
});

test('activeModelEnv — bağlı model provider anahtarını + UNDERDOG_LLM_* değişkenlerini geçirir', async () => {
  const { saveConfig } = await import('./store.js');
  setCredential('anthropic', 'sk-ant-abc123');
  saveConfig({
    activeProvider: 'anthropic',
    activeModel: 'claude-opus-4-8',
    providers: { anthropic: { model: 'claude-opus-4-8' } },
  });
  const env = activeModelEnv();
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant-abc123');
  assert.equal(env.UNDERDOG_LLM_API_KEY, 'sk-ant-abc123');
  assert.equal(env.UNDERDOG_LLM_PROVIDER, 'anthropic');
  assert.equal(env.UNDERDOG_LLM_MODEL, 'claude-opus-4-8');
  assert.equal(env.CAPHLON_MODEL, 'claude-opus-4-8');
});

test('getJudgeModel — bağlanmamışsa null (judge = aktif model davranışına düşülür)', () => {
  assert.equal(getJudgeModel(), null);
  assert.deepEqual(judgeModelEnv(), {});
});

test('getJudgeModel + judgeModelEnv — ayrı judge modeli, kendi sağlayıcı anahtarıyla', async () => {
  const { saveConfig, loadConfig } = await import('./store.js');
  setCredential('groq', 'gsk_judge_key');
  const cfg = loadConfig();
  cfg.judgeProvider = 'groq';
  cfg.judgeModel = 'llama-3.3-70b-versatile';
  saveConfig(cfg);

  const judge = getJudgeModel();
  assert.equal(judge?.provider.id, 'groq');
  assert.equal(judge?.model, 'llama-3.3-70b-versatile');
  assert.equal(judge?.apiKey, 'gsk_judge_key');
  assert.equal(opencodeModelString(judge!), 'groq/llama-3.3-70b-versatile');

  // Judge farklı sağlayıcıda → anahtarı env'e ayrıca girmeli (aktif anthropic idi).
  const env = judgeModelEnv();
  assert.equal(env.GROQ_API_KEY, 'gsk_judge_key');
});

test('judge bağlıyken aktif model değişmez (bağımsız iki ayar)', async () => {
  const { loadConfig } = await import('./store.js');
  const cfg = loadConfig();
  assert.equal(cfg.activeProvider, 'anthropic');
  assert.equal(cfg.activeModel, 'claude-opus-4-8');
  assert.equal(cfg.judgeProvider, 'groq');
});

test.after(() => {
  rmSync(home, { recursive: true, force: true });
});
