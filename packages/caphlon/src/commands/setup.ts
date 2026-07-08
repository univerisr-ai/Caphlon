/**
 * caphlon setup — dışarıdan kurulumun tek adımı.
 *
 * `npm install -g caphlon` yalnız CLI'yı getirir; gerçek araçlar (OpenCode,
 * Aider, Qualixar, MiMo, Open Design — no-rewrite kopyaları) platform
 * dizininde yaşar. Bu komut o platformu kurar:
 *
 *   1. Platform kökünü çöz (CAPHLON_PLATFORM → repo checkout → ~/.caphlon/platform)
 *   2. Yoksa GitHub'dan sığ klonla
 *   3. scripts/setup-cores.sh — araçları indir + derle + venv'ler (idempotent)
 *
 * Tekrar çalıştırmak güvenlidir; eksikleri tamamlar, var olana dokunmaz.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import { onPath, projectRoot, spawnInherit } from '../external.js';

const REPO_URL = 'https://github.com/univerisr-ai/Caphlon.git';

export async function setupCommand(opts: { all?: boolean } = {}): Promise<void> {
  const root = projectRoot();
  const marker = join(root, 'scripts', 'setup-cores.sh');

  console.log(chalk.bold('\n🐙 Caphlon Kurulum'));
  console.log(chalk.gray(`   platform: ${root}\n`));

  if (!existsSync(marker)) {
    if (!onPath('git')) {
      console.error(chalk.red('✖ git bulunamadı — platformu klonlamak için git gerekli.'));
      console.log(chalk.gray('  macOS: xcode-select --install · Linux: apt/dnf install git\n'));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.cyan(`▶ Platform indiriliyor: ${REPO_URL}`));
    mkdirSync(dirname(root), { recursive: true });
    spawnInherit('git', ['clone', '--depth', '1', REPO_URL, root]);
    if (!existsSync(marker)) {
      console.error(chalk.red('✖ Klonlama başarısız görünüyor — yukarıdaki git çıktısına bakın.'));
      process.exitCode = 1;
      return;
    }
  }

  // Araç indirme + derleme + venv'ler; sonunda doctor kendi koşar.
  spawnInherit('bash', [marker, ...(opts.all ? ['--all'] : [])], {}, root);

  console.log(chalk.bold('\nSonraki adımlar:'));
  console.log('  caphlon connect   # bir model sağlayıcısı + API anahtarı bağla');
  console.log('  caphlon           # konuşmaya başla — komut ezberi gerekmez\n');
}
