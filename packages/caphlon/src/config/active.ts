/**
 * Caphlon — Active model resolution & environment injection.
 *
 * Bridges the stored config/credentials to the orchestrator: when Caphlon runs
 * a task it injects the active provider's key + model into the environment so
 * Qualixar OS / MiMo / Hermes pick them up without any extra wiring.
 */

import { getProvider, type ProviderInfo } from './providers.js';
import { loadConfig, getCredential } from './store.js';

export interface ActiveModel {
  provider: ProviderInfo;
  model: string;
  apiKey: string | null;
  baseUrl: string;
}

export function getActiveModel(): ActiveModel | null {
  const cfg = loadConfig();
  if (!cfg.activeProvider || !cfg.activeModel) return null;
  const provider = getProvider(cfg.activeProvider);
  if (!provider) return null;
  const settings = cfg.providers[provider.id];
  // needsKey:false sağlayıcılar sabit/anonim anahtar kullanabilir (örn. Zen "public").
  const apiKey = provider.needsKey ? getCredential(provider.id) : (provider.defaultKey ?? null);
  return {
    provider,
    model: cfg.activeModel,
    apiKey,
    baseUrl: settings?.baseUrl ?? provider.baseUrl,
  };
}

/**
 * Build the env overlay for a child process from the active model.
 * Sets both the provider-specific var (e.g. ANTHROPIC_API_KEY) and the
 * generic UNDERDOG_LLM_* vars the Python orchestrator reads.
 */
export function activeModelEnv(): Record<string, string> {
  const active = getActiveModel();
  if (!active) return {};
  const env: Record<string, string> = {
    UNDERDOG_LLM_PROVIDER: active.provider.id,
    UNDERDOG_LLM_MODEL: active.model,
    UNDERDOG_LLM_BASE_URL: active.baseUrl,
    CAPHLON_PROVIDER: active.provider.id,
    CAPHLON_MODEL: active.model,
  };
  if (active.provider.userAgent) env.UNDERDOG_LLM_USER_AGENT = active.provider.userAgent;
  if (active.apiKey) {
    env[active.provider.envVar] = active.apiKey;
    env.UNDERDOG_LLM_API_KEY = active.apiKey;
  }
  return env;
}

/**
 * Map the active model to a litellm/aider-style model string.
 * Aider (and litellm) expect a "<provider>/<model>" form for most providers.
 */
export function aiderModelString(active: ActiveModel): string {
  const { provider, model } = active;
  switch (provider.id) {
    case 'openai':
      return model; // litellm default namespace
    case 'anthropic':
      return `anthropic/${model}`;
    case 'google':
      return `gemini/${model}`;
    case 'together':
      return `together_ai/${model}`;
    case 'openrouter':
      // stored models already carry their own vendor path (e.g. anthropic/claude-...)
      return model.startsWith('openrouter/') ? model : `openrouter/${model}`;
    default:
      // groq, deepseek, xai, ollama, ... → "<provider>/<model>"
      return `${provider.id}/${model}`;
  }
}

/**
 * Map the active model to OpenCode's "<provider>/<model>" form (models.dev ids).
 * OpenCode namespaces every provider, including openai.
 */
export function opencodeModelString(active: ActiveModel): string {
  const { provider, model } = active;
  if (provider.id === 'openrouter') {
    return model.startsWith('openrouter/') ? model : `openrouter/${model}`;
  }
  return `${provider.id}/${model}`;
}
