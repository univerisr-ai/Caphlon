/**
 * caphlon code — AI pair-programming via the bundled Aider.
 *
 * This does NOT reimplement Aider. It shells out to the real downloaded
 * project at core/aider-main, wiring in the model + API key bound through
 * `caphlon connect`. Aider is the "best part" Caphlon borrows for direct,
 * git-aware code editing.
 *
 *   caphlon code                     Start aider in the current repo
 *   caphlon code src/app.ts          Open specific files
 *   caphlon code -- --message "fix"  Pass raw flags through to aider
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { getActiveModel, aiderModelString } from '../config/active.js';
import { skillContextPaths } from '../config/skills.js';

/** core/aider-main relative to packages/caphlon/dist/commands → project root */
function aiderRepoDir(): string {
  return resolve(import.meta.dirname, '..', '..', '..', '..', 'core', 'aider-main');
}

/** Caphlon'un aider için kurduğu yerel venv (caphlon code kurulum yolu). */
function aiderVenvDir(): string {
  return resolve(import.meta.dirname, '..', '..', '..', '..', 'core', 'aider-venv');
}

/** Decide how to launch the real aider: venv → PATH → bundled module → none. */
function resolveLauncher(): { cmd: string; baseArgs: string[]; env: Record<string, string> } | null {
  // 1. Caphlon'un kendi venv'i (Python ≥3.10 ile pip install -e core/aider-main).
  //    En güvenilir yol: sistem Python'u 3.9 olsa bile burası izole çalışır.
  const venvPy = join(aiderVenvDir(), 'bin', 'python');
  if (existsSync(venvPy)) {
    const importable = spawnSync(venvPy, ['-c', 'import aider.main'], { stdio: 'ignore' });
    if (importable.status === 0) return { cmd: venvPy, baseArgs: ['-m', 'aider'], env: {} };
  }
  // 2. Installed `aider` on PATH (pip install aider-chat)
  const onPath = spawnSync('aider', ['--version'], { stdio: 'ignore' });
  if (onPath.status === 0) {
    return { cmd: 'aider', baseArgs: [], env: {} };
  }
  // 3. Bundled source: python -m aider with PYTHONPATH into core/aider-main.
  //    Only viable if aider's deps actually import (it has many) — otherwise
  //    we fall through to the install hint instead of a raw traceback.
  const repo = aiderRepoDir();
  if (existsSync(join(repo, 'aider', '__init__.py'))) {
    for (const py of ['python3', 'python']) {
      const importable = spawnSync(py, ['-c', 'import aider.main'], {
        stdio: 'ignore',
        env: { ...process.env, PYTHONPATH: repo },
      });
      if (importable.status === 0) {
        return { cmd: py, baseArgs: ['-m', 'aider'], env: { PYTHONPATH: repo } };
      }
    }
  }
  return null;
}

export async function codeCommand(files: string[], rawArgs: string[]): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }

  const launcher = resolveLauncher();
  if (!launcher) {
    console.error(chalk.red('✖ Aider bulunamadı.'));
    console.log('  Seçenekler:');
    console.log('    • pip install aider-chat');
    console.log(`    • veya bundled sürüm için Python kur:  pip install -e ${aiderRepoDir()}`);
    process.exitCode = 1;
    return;
  }

  const modelStr = aiderModelString(active);

  // Skill enjeksiyonu: göreve/dosyalara ilgili SKILL.md'leri aider'a salt-okunur
  // bağlam olarak geçir. Model değişmez; promptu zenginleşir → çıktı farkı artar.
  const query = [...files, ...rawArgs].join(' ');
  const skillPaths = query.trim() ? skillContextPaths(query, 4) : [];
  const readArgs = skillPaths.flatMap((p) => ['--read', p]);

  const args = [...launcher.baseArgs, '--model', modelStr, ...readArgs, ...files, ...rawArgs];

  console.log(chalk.bold(`\n🤝 Aider — ${chalk.cyan(modelStr)}`));
  console.log(chalk.gray(`   (caphlon connect ile bağlı: ${active.provider.id}/${active.model})`));
  if (skillPaths.length) {
    console.log(chalk.gray(`   🧩 ${skillPaths.length} skill enjekte edildi`));
  }
  console.log('');

  // Inject the connected provider's API key into aider's environment.
  const env: NodeJS.ProcessEnv = { ...process.env, ...launcher.env };
  if (active.apiKey) env[active.provider.envVar] = active.apiKey;
  if (active.provider.id === 'ollama') env.OLLAMA_API_BASE = active.baseUrl;

  const child = spawnSync(launcher.cmd, args, { stdio: 'inherit', env });
  if (child.status && child.status !== 0) process.exitCode = child.status;
}
