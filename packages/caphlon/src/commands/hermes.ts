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
import { getActiveModel, activeModelEnv } from '../config/active.js';
import { findPython, firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';
import { spawnSync } from 'node:child_process';

function findHermesDir(): string | null {
  return firstExisting(
    join(projectRoot(), 'hermes-agent-main'),
    join(projectRoot(), 'core', 'hermes-agent-main'),
  );
}

/** Gerçek Hermes'i nasıl başlatacağımıza karar ver: PATH binary → bundled (Python). */
function resolveLauncher(): { cmd: string; baseArgs: string[]; env?: Record<string, string> } | null {
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

  const launcher = resolveLauncher();
  if (!launcher) {
    notFound('Hermes Agent', [
      'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
      'veya bundled sürüm için Python kur + hermes-agent-main bağımlılıklarını yükle (uv sync)',
    ]);
    return;
  }

  console.log(chalk.bold(`\n🪽 Hermes Agent — ${chalk.cyan(active.provider.id + '/' + active.model)}`));
  console.log(chalk.gray('   caphlon connect ile bağlı model kullanılıyor\n'));

  // Bağlı sağlayıcı anahtarını (ANTHROPIC/OPENAI/OPENROUTER...) Hermes'e geçir.
  spawnInherit(launcher.cmd, [...launcher.baseArgs, ...args], { ...activeModelEnv(), ...launcher.env });
}
