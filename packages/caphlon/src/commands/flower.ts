/**
 * caphlon flower — Federated learning (Flower / flwr).
 *
 * Sıfırdan yazmaz: gerçek `flwr` CLI'ını (PATH'te ya da indirilen flower-main
 * kaynağından) çalıştırır. Flower'ın "en iyi yanı" — veriyi yerelde tutan
 * dağıtık ML eğitimi (SuperLink/SuperNode) — buradan kullanılır. Bu bir kodlama
 * ajanı değildir; federated training/analytics işleri içindir.
 *
 *   caphlon flower new        Yeni Flower uygulaması şablonu
 *   caphlon flower run        Federated işi çalıştır
 *   caphlon flower ls         İşleri listele
 *   caphlon flower -- <args>  Bayrakları doğrudan flwr'a geçir
 */

import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getActiveModel } from '../config/active.js';
import { findPython, firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';

function findFlowerDir(): string | null {
  return firstExisting(
    join(projectRoot(), 'flower-main', 'framework'),
    join(projectRoot(), 'core', 'flower-main', 'framework'),
    join(projectRoot(), 'core', 'flower-main'),
  );
}

/** Gerçek flwr'ı nasıl başlatacağımıza karar ver: PATH binary → bundled (Python). */
/** Export'lu: doctor da AYNI kontrolü kullanır (dizin değil gerçek flwr). */
export function resolveFlowerLauncher(): { cmd: string; baseArgs: string[]; env?: Record<string, string> } | null {
  // 1. Caphlon'un kendi flower-venv'i (izole flwr kurulumu — aider-venv gibi).
  const venvFlwr = firstExisting(
    join(projectRoot(), 'core', 'flower-venv', 'bin', 'flwr'),
    join(projectRoot(), 'flower-venv', 'bin', 'flwr'),
  );
  if (venvFlwr) return { cmd: venvFlwr, baseArgs: [] };

  // 2. PATH'teki flwr.
  if (onPath('flwr')) return { cmd: 'flwr', baseArgs: [] };

  // 3. Bundled kaynak (PYTHONPATH ile import).
  const dir = findFlowerDir();
  const py = findPython();
  if (dir && py) {
    const importable = spawnSync(py, ['-c', 'import flwr.cli.app'], {
      stdio: 'ignore',
      env: { ...process.env, PYTHONPATH: dir },
    });
    if (importable.status === 0) {
      return { cmd: py, baseArgs: ['-m', 'flwr.cli.app'], env: { PYTHONPATH: dir } };
    }
  }
  return null;
}

export async function flowerCommand(args: string[]): Promise<void> {
  const launcher = resolveFlowerLauncher();
  if (!launcher) {
    notFound('Flower (flwr)', [
      'pip install flwr',
      'veya bundled sürüm: cd core/flower-main/framework && pip install -e .',
    ]);
    return;
  }

  // Flower'ın model servisi opsiyonel; bağlı anahtar varsa FLWR_MODEL_API_KEY olarak geçir.
  const env: Record<string, string> = { ...launcher.env };
  const active = getActiveModel();
  if (active?.apiKey) env.FLWR_MODEL_API_KEY = active.apiKey;

  // flwr, yardımcı binary'lerini (flower-superlink/-supernode) PATH'te arar; bunlar
  // venv'in bin'inde. Venv flwr'ı kullanılıyorsa o bin'i PATH'e ekle ki bulunabilsinler.
  if (launcher.cmd.includes('flower-venv') || launcher.cmd.includes('/bin/flwr')) {
    const binDir = dirname(launcher.cmd);
    env.PATH = `${binDir}:${process.env.PATH ?? ''}`;
  }

  spawnInherit(launcher.cmd, [...launcher.baseArgs, ...args], env);
}
