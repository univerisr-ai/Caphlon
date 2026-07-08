/**
 * Caphlon — shared helpers for wiring REAL downloaded tools.
 *
 * Caphlon hiçbir aracı taklit etmez: bu yardımcılar gerçek araç binary'sini
 * (PATH'te ya da indirilen kaynak dizininde) bulup, `caphlon connect` ile bağlı
 * modeli ortam değişkenleriyle geçirip alt süreç olarak çalıştırır. Araç yoksa
 * ham hata yerine kurulum ipucu gösterilir — tıpkı `caphlon code` (Aider) gibi.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import chalk from 'chalk';

/**
 * Platform kökü — vendored araçların (core/*, MiMo-Code-main, open-design-main)
 * yaşadığı yer. Çözüm sırası:
 *  1. CAPHLON_PLATFORM env — kullanıcı sabitlemesi (test/özel kurulum)
 *  2. paket-göreli repo kökü — kaynaktan klonla çalışırken (git checkout)
 *  3. ~/.caphlon/platform — global npm kurulumunda `caphlon setup`un kurduğu ev
 * "Repo kökü" tespiti içerikle yapılır (scripts/setup-cores.sh var mı) — global
 * node_modules altında 2. adım doğal olarak tutmaz, 3'e düşülür.
 */
export function projectRoot(): string {
  const env = process.env.CAPHLON_PLATFORM;
  if (env) return env;
  const rel = resolve(import.meta.dirname, '..', '..', '..');
  if (existsSync(join(rel, 'scripts', 'setup-cores.sh'))) return rel;
  return join(homedir(), '.caphlon', 'platform');
}

/** Bir komut PATH'te çalışıyor mu? (probe ile) */
export function onPath(cmd: string, probeArg = '--version'): boolean {
  try {
    return spawnSync(cmd, [probeArg], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/** Bun'ı bul (PATH → ~/.bun/bin/bun). MiMo gibi Bun tabanlı araçlar için. */
export function findBun(): string | null {
  if (onPath('bun')) return 'bun';
  const p = join(homedir(), '.bun', 'bin', 'bun');
  return existsSync(p) ? p : null;
}

/** Python yorumlayıcısını bul (python3 → python). */
export function findPython(): string | null {
  for (const py of ['python3', 'python']) if (onPath(py)) return py;
  return null;
}

/** Aracı miras (inherit) stdio ile çalıştır; çıkış kodunu yansıt. */
export function spawnInherit(
  cmd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  cwd?: string,
): void {
  const child = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    cwd,
  });
  if (child.status && child.status !== 0) process.exitCode = child.status;
}

/** Araç bulunamadığında tek tip "kurulum ipucu" çıktısı. */
export function notFound(name: string, hints: string[]): void {
  console.error(chalk.red(`\n✖ ${name} bulunamadı.`));
  console.log(chalk.gray('  Kurulum seçenekleri:'));
  for (const h of hints) console.log('    • ' + h);
  console.log('');
  process.exitCode = 1;
}

/** İlk var olan yolu döndür (indirilen kaynak dizinlerini ararken). */
export function firstExisting(...paths: string[]): string | null {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}
