/**
 * Caphlon — Provider Catalog
 *
 * OpenCode-style model/provider registry. Used by `caphlon connect` and
 * `caphlon model` to bind an LLM provider + API key to the platform.
 *
 * Mirrors the provider set understood by Qualixar OS' router so credentials
 * stored here flow straight into the orchestrator.
 */

export interface ProviderModel {
  /** Model id passed to the provider API */
  id: string;
  /** Human label shown in the picker */
  label: string;
}

export interface ProviderInfo {
  /** Stable provider id (lowercase) */
  id: string;
  /** Display name */
  name: string;
  /** Environment variable the SDKs read the key from */
  envVar: string;
  /** Default REST base URL */
  baseUrl: string;
  /** Typical API-key prefix (for a soft sanity check; empty = skip) */
  keyPrefix: string;
  /** Whether this provider needs an API key at all (Ollama is local) */
  needsKey: boolean;
  /** Sabit/anonim anahtar (örn. OpenCode Zen "public" free tier). needsKey:false ile kullanılır. */
  defaultKey?: string;
  /** Cloudflare/proxy için gereken User-Agent (boşsa varsayılan). */
  userAgent?: string;
  /** Where to get a key */
  keysUrl: string;
  /** Popular models — first entry is the default */
  models: ProviderModel[];
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    keyPrefix: 'sk-ant-',
    needsKey: true,
    keysUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (en güçlü)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (dengeli)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (hızlı/ucuz)' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    keyPrefix: 'sk-',
    needsKey: true,
    keysUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (ucuz)' },
      { id: 'o3-mini', label: 'o3-mini (reasoning)' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPrefix: 'sk-or-',
    needsKey: true,
    keysUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'openrouter/auto', label: 'Auto (en iyi modeli seçer)' },
      { id: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (ucuz)' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyPrefix: '',
    needsKey: true,
    keysUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    envVar: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefix: 'gsk_',
    needsKey: true,
    keysUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    keyPrefix: 'sk-',
    needsKey: true,
    keysUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    envVar: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    keyPrefix: 'xai-',
    needsKey: true,
    keysUrl: 'https://console.x.ai',
    models: [{ id: 'grok-2-latest', label: 'Grok 2' }],
  },
  {
    id: 'together',
    name: 'Together AI',
    envVar: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz/v1',
    keyPrefix: '',
    needsKey: true,
    keysUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
    ],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    envVar: 'COHERE_API_KEY',
    baseUrl: 'https://api.cohere.ai/v1',
    keyPrefix: '',
    needsKey: true,
    keysUrl: 'https://dashboard.cohere.com/api-keys',
    models: [
      { id: 'command-a-03-2025', label: 'Command A (en güçlü)' },
      { id: 'command-r-plus-08-2024', label: 'Command R+' },
      { id: 'command-r-08-2024', label: 'Command R (hızlı/ucuz)' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    envVar: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    keyPrefix: '',
    needsKey: true,
    keysUrl: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'mistral-small-latest', label: 'Mistral Small (ucuz)' },
      { id: 'codestral-latest', label: 'Codestral (kod)' },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    envVar: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyPrefix: '',
    needsKey: true,
    keysUrl: 'https://cloud.cerebras.ai',
    models: [
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B (çok hızlı)' },
      { id: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen3 235B' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (yerel)',
    envVar: 'OLLAMA_HOST',
    baseUrl: 'http://localhost:11434/v1',
    keyPrefix: '',
    needsKey: false,
    keysUrl: 'https://ollama.com/download',
    models: [
      { id: 'llama3.2', label: 'Llama 3.2 (yerel)' },
      { id: 'qwen2.5-coder', label: 'Qwen2.5 Coder (yerel)' },
    ],
  },
  {
    // OpenCode Zen — ücretsiz "public" tier (anahtar gerekmez). opencode'un
    // /zen/v1 ağ geçidi; Cloudflare User-Agent ister.
    id: 'opencode',
    name: 'OpenCode Zen',
    envVar: 'OPENCODE_ZEN_KEY',
    baseUrl: 'https://opencode.ai/zen/v1',
    keyPrefix: '',
    needsKey: false,
    defaultKey: 'public',
    userAgent: 'opencode/0.1',
    keysUrl: 'https://opencode.ai/zen',
    models: [
      { id: 'north-mini-code-free', label: 'North Mini Code (free)' },
      { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (free)' },
      { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (free)' },
      { id: 'mimo-v2.5-free', label: 'MiMo V2.5 (free)' },
      { id: 'big-pickle', label: 'Big Pickle (free)' },
    ],
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id.toLowerCase());
}

/** Resolve a "provider/model" or "provider" string to {provider, model}. */
export function resolveModelRef(ref: string): {
  provider: ProviderInfo;
  model: string;
} | null {
  const [provId, ...rest] = ref.split('/');
  const provider = getProvider(provId);
  if (!provider) return null;
  const model = rest.length > 0 ? rest.join('/') : provider.models[0]!.id;
  return { provider, model };
}
