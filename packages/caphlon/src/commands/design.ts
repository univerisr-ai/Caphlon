/**
 * caphlon design — Open Design pipeline, gerçek `od` CLI ile.
 *
 * Sıfırdan yazmaz / API uydurmaz: indirilen gerçek Open Design projesini
 * (open-design-main) `od` CLI'ı üzerinden çalıştırır ve `caphlon connect` ile
 * bağlı modeli ortam değişkenleriyle geçirir. Open Design'ın "en iyi yanı" —
 * ajan-yerlisi tasarım ürünü (prototip/HyperFrame/deck/görsel) — buradan gelir.
 *
 *   caphlon design                     od yardımını göster (tüm komutlar)
 *   caphlon design ui                  Web arayüzünü aç
 *   caphlon design plugin list         Tasarım eklentilerini listele
 *   caphlon design -- <ham od args>    Bayrakları doğrudan od'a geçir
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import chalk from 'chalk';
import { getActiveModel, activeModelEnv } from '../config/active.js';
import { firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';

function findOdDir(): string | null {
  return firstExisting(
    join(projectRoot(), 'open-design-main'),
    join(projectRoot(), 'core', 'open-design-main'),
  );
}

/** Bundled od.mjs yalnızca dist/cli.js derlenmişse çalışır. */
function bundledOdEntry(dir: string): string | null {
  const mjs = join(dir, 'apps', 'daemon', 'bin', 'od.mjs');
  const dist = join(dir, 'apps', 'daemon', 'dist', 'cli.js');
  return existsSync(mjs) && existsSync(dist) ? mjs : null;
}

/**
 * PATH'teki `od`'un sistem octal-dump aracı (/usr/bin/od) değil, Open Design
 * olduğunu doğrula — yardım çıktısı Open Design'a özgü terimler içermeli.
 */
function pathOdIsOpenDesign(): boolean {
  try {
    const out = spawnSync('od', ['--help'], { encoding: 'utf8', timeout: 5000 });
    const text = `${out.stdout ?? ''}${out.stderr ?? ''}`.toLowerCase();
    return /open[ -]?design|design system|hyperframe|prototype|daemon/.test(text);
  } catch {
    return false;
  }
}

/** Gerçek od'u nasıl çalıştıracağımıza karar ver: bundled (derli) → PATH (doğrulanmış). */
function resolveOd(): { cmd: string; baseArgs: string[] } | null {
  const dir = findOdDir();
  if (dir) {
    const mjs = bundledOdEntry(dir);
    if (mjs) return { cmd: 'node', baseArgs: [mjs] };
  }
  if (onPath('od') && pathOdIsOpenDesign()) return { cmd: 'od', baseArgs: [] };
  return null;
}

export async function designCommand(args: string[]): Promise<void> {
  const od = resolveOd();
  if (!od) {
    notFound('Open Design (od)', [
      'Bundled: cd open-design-main && pnpm install && pnpm --filter @open-design/daemon build',
      'sonra: caphlon design ui',
    ]);
    console.log(chalk.gray('  Not: çoğu komut Open Design daemon (port 7456) ister → "caphlon design daemon start".\n'));
    return;
  }

  const passthrough = args.length ? args : ['--help'];
  console.log(chalk.bold('\n🎨 Open Design'));

  // Bağlı model varsa BYOK olarak geçir (Open Design Claude/OpenAI/Gemini... destekler).
  const active = getActiveModel();
  if (active) {
    console.log(chalk.gray(`   caphlon connect modeli geçiriliyor: ${active.provider.id}/${active.model}\n`));
  } else {
    console.log(chalk.gray('   (model bağlı değil — Open Design kendi model seçicisini kullanır)\n'));
  }

  spawnInherit(od.cmd, [...od.baseArgs, ...passthrough], active ? activeModelEnv() : {});
}
