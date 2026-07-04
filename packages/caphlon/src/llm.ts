/**
 * Caphlon — tek-atış LLM çağrısı (bundled litellm üzerinden).
 *
 * No-rewrite: kendi provider-routing'imizi YAZMAYIZ — çağrıyı, zaten kurulu
 * olan gerçek litellm'e (core/aider-venv, `caphlon serve`nin de kullandığı)
 * shell-out ederiz. Böylece `caphlon connect` ile bağlı HER sağlayıcı
 * (anthropic/openai/groq/Zen/ollama/...) tek koddan çalışır.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './external.js';
import { aiderModelString, type ActiveModel } from './config/active.js';

export interface LlmRequest {
  system?: string;
  user: string;
  maxTokens?: number;
}

export interface LitellmParams {
  model: string;
  apiBase?: string;
  extraHeaders?: Record<string, string>;
}

/**
 * Aktif modeli litellm çağrı parametrelerine eşle (saf — testlenebilir).
 * litellm'in tanımadığı OpenAI-uyumlu ağ geçitleri (Zen) `openai/<model>` +
 * api_base ile çağrılır; bilinen sağlayıcılar aider'ın model-string eşlemesini
 * aynen kullanır (tek doğruluk kaynağı).
 */
export function litellmParams(m: ActiveModel): LitellmParams {
  if (m.provider.id === 'opencode') {
    return {
      model: `openai/${m.model}`,
      apiBase: m.baseUrl,
      extraHeaders: m.provider.userAgent ? { 'User-Agent': m.provider.userAgent } : undefined,
    };
  }
  if (m.provider.id === 'ollama') {
    return { model: `ollama/${m.model}`, apiBase: m.baseUrl.replace(/\/v1$/, '') };
  }
  const params: LitellmParams = { model: aiderModelString(m) };
  // Kullanıcı baseUrl'i override ettiyse (self-host/proxy) litellm'e geçir.
  if (m.baseUrl && m.baseUrl !== m.provider.baseUrl) params.apiBase = m.baseUrl;
  return params;
}

const PY_ONESHOT = `
import sys, json, litellm
r = json.load(sys.stdin)
msgs = ([{"role": "system", "content": r["system"]}] if r["system"] else []) + [
    {"role": "user", "content": r["user"]}
]
kw = {}
if r["api_base"]: kw["api_base"] = r["api_base"]
if r["api_key"]: kw["api_key"] = r["api_key"]
if r["extra_headers"]: kw["extra_headers"] = r["extra_headers"]
resp = litellm.completion(model=r["model"], messages=msgs, max_tokens=r["max_tokens"], temperature=0, **kw)
print("\\n__CAPHLON_LLM__" + json.dumps({"content": resp.choices[0].message.content or ""}))
`;

/** Bağlı bir modelle tek soru-cevap. Hata durumunda fırlatır (sessiz boş dönmez). */
export function llmComplete(m: ActiveModel, req: LlmRequest): string {
  const py = join(projectRoot(), 'core', 'aider-venv', 'bin', 'python');
  if (!existsSync(py)) {
    throw new Error('litellm bulunamadı (core/aider-venv yok) → make setup-cores');
  }
  const p = litellmParams(m);
  const payload = JSON.stringify({
    model: p.model,
    api_base: p.apiBase ?? null,
    api_key: m.apiKey ?? null,
    extra_headers: p.extraHeaders ?? null,
    system: req.system ?? null,
    user: req.user,
    max_tokens: req.maxTokens ?? 3000,
  });
  const res = spawnSync(py, ['-c', PY_ONESHOT], {
    input: payload,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (res.status !== 0) {
    throw new Error(`LLM çağrısı başarısız (${p.model}): ${(res.stderr ?? '').slice(-500)}`);
  }
  // litellm stdout'a kendi logunu basabilir — işaretli son satırı al.
  const marker = res.stdout.lastIndexOf('__CAPHLON_LLM__');
  if (marker === -1) throw new Error(`LLM yanıtı ayrıştırılamadı: ${res.stdout.slice(-300)}`);
  return (JSON.parse(res.stdout.slice(marker + '__CAPHLON_LLM__'.length)) as { content: string }).content;
}
