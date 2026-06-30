/**
 * Caphlon — Tool auto-discovery & linking.
 *
 * Cihazdaki AI kodlama araçlarını (Claude Code, OpenCode, Codex) otomatik bulur
 * ve caphlon'un yerel gateway'ini (caphlon serve → LiteLLM proxy) onların
 * model/sağlayıcı listesine ekler. Böylece o araçlar caphlon'a bağlı modeli
 * (ücretsiz Zen dahil) otomatik kullanır.
 *
 * No-rewrite: araçların kendi config formatına yazarız (kendi protokol uydurmayız);
 * gateway de gerçek LiteLLM proxy'dir. Her değişiklik ÖNCE yedeklenir ve
 * `caphlon tools unlink` ile geri alınabilir.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { onPath } from '../external.js';

export const DEFAULT_GATEWAY = 'http://127.0.0.1:4000';

export interface ToolStatus {
  id: string;
  name: string;
  installed: boolean;
  configPath: string;
  linked: boolean;
}

export interface ToolAdapter {
  id: string;
  name: string;
  /** Cihazda kurulu mu? (binary veya config dizini) */
  detect(): boolean;
  /** Hedef config dosyası */
  configPath(): string;
  /** caphlon gateway'ine zaten bağlı mı? */
  isLinked(): boolean;
  /** Gateway + model'i config'e ekle (önce yedekler) */
  link(gateway: string, model: string): void;
  /** Bağlantıyı kaldır (mümkünse yedekten) */
  unlink(): void;
}

// --- yardımcılar -----------------------------------------------------------

function backupOnce(file: string): void {
  const bak = `${file}.caphlon-bak`;
  if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
}

function readJson(file: string): Record<string, any> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
  } catch {
    return {};
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// --- Claude Code -----------------------------------------------------------

const claudeAdapter: ToolAdapter = {
  id: 'claude',
  name: 'Claude Code',
  detect: () => onPath('claude') || existsSync(join(homedir(), '.claude')),
  configPath: () => join(homedir(), '.claude', 'settings.json'),
  isLinked() {
    const cfg = readJson(this.configPath());
    return cfg.env?.ANTHROPIC_BASE_URL?.includes('caphlon') === true ||
      cfg.env?.CAPHLON_LINKED === '1';
  },
  link(gateway, model) {
    const file = this.configPath();
    backupOnce(file);
    const cfg = readJson(file);
    cfg.env = {
      ...cfg.env,
      ANTHROPIC_BASE_URL: gateway,
      ANTHROPIC_AUTH_TOKEN: 'caphlon',
      ANTHROPIC_MODEL: model,
      ANTHROPIC_SMALL_FAST_MODEL: model,
      CAPHLON_LINKED: '1',
    };
    writeJson(file, cfg);
  },
  unlink() {
    const file = this.configPath();
    const cfg = readJson(file);
    if (cfg.env) {
      for (const k of [
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_MODEL',
        'ANTHROPIC_SMALL_FAST_MODEL',
        'CAPHLON_LINKED',
      ]) {
        delete cfg.env[k];
      }
      if (Object.keys(cfg.env).length === 0) delete cfg.env;
    }
    writeJson(file, cfg);
  },
};

// --- OpenCode --------------------------------------------------------------

const opencodeAdapter: ToolAdapter = {
  id: 'opencode',
  name: 'OpenCode',
  detect: () => onPath('opencode') || existsSync(join(homedir(), '.config', 'opencode')),
  configPath: () => join(homedir(), '.config', 'opencode', 'opencode.json'),
  isLinked() {
    return !!readJson(this.configPath()).provider?.caphlon;
  },
  link(gateway, model) {
    const file = this.configPath();
    backupOnce(file);
    const cfg = readJson(file);
    cfg.$schema ??= 'https://opencode.ai/config.json';
    cfg.provider ??= {};
    cfg.provider.caphlon = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Caphlon',
      options: { baseURL: `${gateway}/v1`, apiKey: 'caphlon' },
      models: { [model]: { name: `caphlon/${model}` } },
    };
    writeJson(file, cfg);
  },
  unlink() {
    const file = this.configPath();
    const cfg = readJson(file);
    if (cfg.provider?.caphlon) {
      delete cfg.provider.caphlon;
      if (Object.keys(cfg.provider).length === 0) delete cfg.provider;
    }
    writeJson(file, cfg);
  },
};

// --- Codex (OpenAI) --------------------------------------------------------

const CODEX_START = '# >>> caphlon >>>';
const CODEX_END = '# <<< caphlon <<<';

const codexAdapter: ToolAdapter = {
  id: 'codex',
  name: 'Codex',
  detect: () => onPath('codex') || existsSync(join(homedir(), '.codex')),
  configPath: () => join(homedir(), '.codex', 'config.toml'),
  isLinked() {
    const file = this.configPath();
    return existsSync(file) && readFileSync(file, 'utf8').includes(CODEX_START);
  },
  link(gateway, model) {
    const file = this.configPath();
    backupOnce(file);
    const prev = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const cleaned = stripBlock(prev);
    const block =
      `${CODEX_START}\n` +
      `model = "${model}"\n` +
      `model_provider = "caphlon"\n` +
      `[model_providers.caphlon]\n` +
      `name = "Caphlon"\n` +
      `base_url = "${gateway}/v1"\n` +
      `wire_api = "chat"\n` +
      `${CODEX_END}\n`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, (cleaned ? cleaned.trimEnd() + '\n\n' : '') + block);
  },
  unlink() {
    const file = this.configPath();
    if (!existsSync(file)) return;
    writeFileSync(file, stripBlock(readFileSync(file, 'utf8')));
  },
};

function stripBlock(text: string): string {
  const s = text.indexOf(CODEX_START);
  const e = text.indexOf(CODEX_END);
  if (s === -1 || e === -1) return text;
  return (text.slice(0, s) + text.slice(e + CODEX_END.length)).replace(/\n{3,}/g, '\n\n');
}

// --- registry --------------------------------------------------------------

export const ADAPTERS: ToolAdapter[] = [claudeAdapter, opencodeAdapter, codexAdapter];

export function detectTools(): ToolStatus[] {
  return ADAPTERS.map((a) => ({
    id: a.id,
    name: a.name,
    installed: a.detect(),
    configPath: a.configPath(),
    linked: a.isLinked(),
  }));
}

export function getAdapter(id: string): ToolAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
