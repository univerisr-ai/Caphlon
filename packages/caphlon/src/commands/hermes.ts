/**
 * caphlon hermes — Hermes Agent (Nous Research) ile kendi kendine öğrenen ajan.
 *
 * Sıfırdan yazmaz: gerçek `hermes` CLI'ını (PATH'te ya da indirilen
 * hermes-agent-main kaynağından) çalıştırır ve `caphlon connect` ile bağlı
 * modeli ortam değişkenleriyle geçirir. Hermes'in "en iyi yanı" — kapalı
 * öğrenme döngüsü, kalıcı hafıza (FTS5), çoklu-platform gateway — buradan gelir.
 *
 *   caphlon hermes                 Etkileşimli sohbet
 *   caphlon hermes setup           Kurulum sihirbazı
 *   caphlon hermes gateway start   Telegram/Discord/Slack gateway
 *   caphlon hermes -- <ham args>   Bayrakları doğrudan Hermes'e geçir
 */

import { join } from 'node:path';
import chalk from 'chalk';
import { getActiveModel, activeModelEnv, type ActiveModel } from '../config/active.js';
import { findPython, firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';
import { spawnSync } from 'node:child_process';

/**
 * Bağlı modeli Hermes'in beklediği ortam değişkenlerine çevir (setup sihirbazı
 * atlanır). Hermes provider adları farklıdır (openai → "openai-api", google →
 * "gemini"); native olmayan sağlayıcılar OpenAI-uyumlu olarak bağlanır.
 */
function hermesModelEnv(active: ActiveModel): Record<string, string> {
  const env: Record<string, string> = { HERMES_INFERENCE_MODEL: active.model };
  const key = active.apiKey ?? '';
  switch (active.provider.id) {
    case 'anthropic':
      env.HERMES_INFERENCE_PROVIDER = 'anthropic';
      if (key) env.ANTHROPIC_API_KEY = key;
      break;
    case 'openai':
      env.HERMES_INFERENCE_PROVIDER = 'openai-api';
      if (key) env.OPENAI_API_KEY = key;
      break;
    case 'openrouter':
      env.HERMES_INFERENCE_PROVIDER = 'openrouter';
      if (key) env.OPENROUTER_API_KEY = key;
      break;
    case 'google':
      env.HERMES_INFERENCE_PROVIDER = 'gemini';
      if (key) {
        env.GOOGLE_API_KEY = key;
        env.GEMINI_API_KEY = key;
      }
      break;
    default:
      // groq, deepseek, xai, together, ollama → OpenAI-uyumlu endpoint
      env.HERMES_INFERENCE_PROVIDER = 'openai-api';
      if (key) env.OPENAI_API_KEY = key;
      env.OPENAI_BASE_URL = active.baseUrl;
      break;
  }
  return env;
}

function findHermesDir(): string | null {
  return firstExisting(
    join(projectRoot(), 'hermes-agent-main'),
    join(projectRoot(), 'core', 'hermes-agent-main'),
  );
}

/** Gerçek Hermes'i nasıl başlatacağımıza karar ver: PATH binary → bundled (Python).
 *  Export'lu: doctor da AYNI kontrolü kullanır (yüzeysel "dizin var mı" yerine). */
export function resolveHermesLauncher(): { cmd: string; baseArgs: string[]; env?: Record<string, string> } | null {
  if (onPath('hermes')) return { cmd: 'hermes', baseArgs: [] };

  const dir = findHermesDir();
  const py = findPython();
  if (dir && py) {
    // src-layout veya kök-layout: hangisinden import edilebiliyorsa onu kullan.
    for (const root of [dir, join(dir, 'src')]) {
      const importable = spawnSync(py, ['-c', 'import hermes_cli.main'], {
        stdio: 'ignore',
        env: { ...process.env, PYTHONPATH: root },
      });
      if (importable.status === 0) {
        return { cmd: py, baseArgs: ['-m', 'hermes_cli'], env: { PYTHONPATH: root } };
      }
    }
  }
  return null;
}

export async function hermesCommand(args: string[]): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }

  const launcher = resolveHermesLauncher();
  if (!launcher) {
    notFound('Hermes Agent', [
      'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
      'veya bundled sürüm için Python kur + hermes-agent-main bağımlılıklarını yükle (uv sync)',
    ]);
    return;
  }

  console.log(chalk.bold(`\n🪽 Hermes Agent — ${chalk.cyan(active.provider.id + '/' + active.model)}`));
  console.log(chalk.gray('   caphlon connect modeli Hermes\'e geçiriliyor (setup sihirbazı atlanır)\n'));

  // Bağlı modeli Hermes'in env şemasına çevir + genel anahtarları da ekle.
  spawnInherit(launcher.cmd, [...launcher.baseArgs, ...args], {
    ...activeModelEnv(),
    ...hermesModelEnv(active),
    ...launcher.env,
  });
}
