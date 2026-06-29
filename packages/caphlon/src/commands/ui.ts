/**
 * caphlon ui / tui — Caphlon's interface IS OpenCode's interface, customized.
 *
 * No reimplementation: launches the real OpenCode TUI. We prefer running our
 * *customized* source build at core/opencode-main (Caphlon logo, theme, UI
 * strings) via Bun; if Bun isn't available we fall back to the installed
 * `opencode` binary (the Caphlon theme + instructions still apply via config).
 *
 * The connected model + API key (from `caphlon connect`) are wired in either way.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { getActiveModel, opencodeModelString } from '../config/active.js';
import { tokenlessBinaryPath } from './tokenless.js';

/** core/opencode-main relative to packages/caphlon/dist/commands → project root */
function opencodeRepoDir(): string {
  return resolve(import.meta.dirname, '..', '..', '..', '..', 'core', 'opencode-main');
}

/** packages/caphlon/opencode-profile (our config + theme source of truth) */
function profileDir(): string {
  return resolve(import.meta.dirname, '..', '..', 'opencode-profile');
}

/**
 * Maksimum token tasarrufu: tokenless kuruluysa onu OpenCode'a MCP sunucusu
 * olarak bağla (şema/yanıt sıkıştırma + TOON kodlama araçları UI'daki AI'a
 * açılır). Kurulu değilse girdiyi temizle — böylece açılışta hata/çöp çıkmaz.
 * Profilin opencode.json'ını her başlatışta uzlaştırır (reconcile).
 */
export function reconcileTokenlessMcp(profile: string): boolean {
  const cfgPath = join(profile, 'opencode.json');
  if (!existsSync(cfgPath)) return false;
  let cfg: Record<string, any>;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, any>;
  } catch {
    return false;
  }

  const bin = tokenlessBinaryPath();
  const before = JSON.stringify(cfg);
  cfg.mcp ??= {};
  cfg.mcp.servers ??= {};

  if (bin) {
    cfg.mcp.servers.tokenless = {
      type: 'local',
      command: [bin, 'mcp-server'],
      timeout: { startup: 60000 },
    };
  } else {
    delete cfg.mcp.servers.tokenless;
    if (Object.keys(cfg.mcp.servers).length === 0) delete cfg.mcp.servers;
    if (cfg.mcp && Object.keys(cfg.mcp).length === 0) delete cfg.mcp;
  }

  if (JSON.stringify(cfg) !== before) {
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }
  return !!bin;
}

function findBun(): string | null {
  if (spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0) return 'bun';
  const p = join(homedir(), '.bun', 'bin', 'bun');
  return existsSync(p) ? p : null;
}

interface Launcher {
  cmd: string;
  baseArgs: string[];
  custom: boolean;
  /** Working dir for the spawned process (custom source needs packages/opencode for JSX). */
  cwd?: string;
}

/** Prefer our customized source via Bun; fall back to the installed binary. */
function resolveLauncher(): Launcher | null {
  const repo = opencodeRepoDir();
  const pkg = join(repo, 'packages', 'opencode');
  const bun = findBun();
  if (bun && existsSync(join(pkg, 'src', 'index.ts')) && existsSync(join(repo, 'node_modules'))) {
    // Mirror OpenCode's own dev invocation (cwd = packages/opencode) so the
    // solid-js JSX runtime resolves; the user's project is passed positionally.
    return { cmd: bun, baseArgs: ['run', '--conditions=browser', 'src/index.ts'], custom: true, cwd: pkg };
  }
  if (spawnSync('opencode', ['--version'], { stdio: 'ignore' }).status === 0) {
    return { cmd: 'opencode', baseArgs: [], custom: false };
  }
  return null;
}

export async function uiCommand(passthrough: string[]): Promise<void> {
  const launcher = resolveLauncher();
  if (!launcher) {
    console.error(chalk.red('✖ OpenCode bulunamadı.'));
    console.log('  Seçenekler:');
    console.log('    • curl -fsSL https://opencode.ai/install | bash');
    console.log('    • npm i -g opencode-ai');
    console.log('    • veya özelleştirilmiş sürüm için Bun kur: https://bun.sh');
    process.exitCode = 1;
    return;
  }

  const active = getActiveModel();
  const userCwd = process.cwd();
  const args = [...launcher.baseArgs];
  const env: NodeJS.ProcessEnv = { ...process.env };

  // When running the custom source (cwd = packages/opencode), tell OpenCode to
  // operate on the user's actual directory via the [project] positional.
  if (launcher.custom) args.push(userCwd);

  // Caphlon look + persona: point OpenCode's config dir at our profile, which
  // ships tui.json (theme: caphlon), themes/caphlon.json, and opencode.json
  // (instructions). This isolates our settings without touching ~/.config.
  const profile = profileDir();
  if (existsSync(join(profile, 'tui.json'))) {
    env.OPENCODE_CONFIG_DIR = profile;
  }

  // Maksimum token tasarrufu: tokenless varsa MCP olarak bağla (yoksa temizle).
  const tokenlessOn = reconcileTokenlessMcp(profile);

  if (active) {
    args.push('--model', opencodeModelString(active));
    if (active.apiKey) env[active.provider.envVar] = active.apiKey;
    if (active.provider.id === 'ollama') env.OLLAMA_HOST = active.baseUrl;
    const tag = launcher.custom ? chalk.gray(' (özelleştirilmiş)') : '';
    console.log(chalk.bold(`\n🖥  Caphlon TUI — ${chalk.cyan(opencodeModelString(active))}`) + tag);
    console.log(chalk.gray('   caphlon connect ile bağlı model kullanılıyor\n'));
  } else {
    console.log(chalk.yellow('\n⚠ Aktif model yok — TUI kendi model seçicisini açacak.'));
    console.log(chalk.gray('   İstersen önce: caphlon connect\n'));
  }

  if (tokenlessOn) {
    console.log(chalk.green('   🪶 tokenless aktif — maksimum token tasarrufu (şema/yanıt sıkıştırma)\n'));
  } else {
    console.log(chalk.gray('   🪶 token tasarrufu: tokenless kurulu değil → `caphlon tokenless init` (cargo install tokenless)\n'));
  }

  args.push(...passthrough);
  const child = spawnSync(launcher.cmd, args, { stdio: 'inherit', env, cwd: launcher.cwd });
  if (child.status && child.status !== 0) process.exitCode = child.status;
}
