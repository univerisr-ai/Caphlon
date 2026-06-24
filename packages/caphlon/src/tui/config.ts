/**
 * Caphlon TUI — Configuration & API Key Management
 *
 * Stores settings in ~/.caphlon/config.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export interface CaphlonConfig {
  apiKey?: string;
  model?: string;
  theme?: 'dark' | 'light';
  firstRun?: boolean;
}

const CONFIG_DIR = join(homedir(), '.caphlon');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: CaphlonConfig = {
  model: 'auto',
  theme: 'dark',
  firstRun: true,
};

export async function loadConfig(): Promise<CaphlonConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: CaphlonConfig): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function getApiKey(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.apiKey;
}

export async function setApiKey(key: string): Promise<void> {
  const config = await loadConfig();
  config.apiKey = key;
  config.firstRun = false;
  await saveConfig(config);
}

export async function isFirstRun(): Promise<boolean> {
  const config = await loadConfig();
  return config.firstRun ?? true;
}

export async function markConfigured(): Promise<void> {
  const config = await loadConfig();
  config.firstRun = false;
  await saveConfig(config);
}
