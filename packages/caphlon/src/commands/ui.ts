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
import { resolveAiderLauncher } from './code.js';
import { projectRoot } from '../external.js';
import { writeSkillsIndex, listSkills } from '../config/skills.js';

/**
 * Skill katmanını TUI'ye bağla: skill indeksini profile yaz ve opencode.json
 * `instructions`'a ekle (yoksa). Böylece düz `caphlon` da skill'leri görür ve
 * model gerektiğinde tam SKILL.md'yi okur. Skill sayısını döndürür.
 */
export function reconcileSkillsInstruction(profile: string): number {
  const cfgPath = join(profile, 'opencode.json');
  if (!existsSync(cfgPath)) return 0;
  const indexPath = writeSkillsIndex(profile); // profile/SKILLS_INDEX.md (skill varsa)
  let cfg: Record<string, any>;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, any>;
  } catch {
    return 0;
  }
  const before = JSON.stringify(cfg);
  const list: string[] = Array.isArray(cfg.instructions) ? cfg.instructions : [];
  const has = list.includes('SKILLS_INDEX.md');
  if (indexPath && !has) list.push('SKILLS_INDEX.md');
  else if (!indexPath && has) list.splice(list.indexOf('SKILLS_INDEX.md'), 1);
  cfg.instructions = list;
  if (JSON.stringify(cfg) !== before) {
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }
  return indexPath ? listSkills().length : 0;
}

/** core/opencode-main relative to packages/caphlon/dist/commands → project root */
function opencodeRepoDir(): string {
  return join(projectRoot(), 'core', 'opencode-main');
}

/** Platform kökü — merkez çözüm (env → repo → ~/.caphlon/platform). */
function projRoot(): string {
  return projectRoot();
}

/**
 * Tasarım yeteneklerini otomatik aktar: Open Design DERLENMİŞSE onun stdio MCP
 * sunucusunu (`od mcp live-artifacts`) OpenCode'a bağla → caphlon yazınca açılan
 * AI tasarım/live-artifact araçlarını da otomatik kullanır. Derli değilse temizler.
 */
export function reconcileOpenDesignMcp(profile: string): boolean {
  const cfgPath = join(profile, 'opencode.json');
  if (!existsSync(cfgPath)) return false;
  let cfg: Record<string, any>;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, any>;
  } catch {
    return false;
  }
  const odMjs = join(projRoot(), 'open-design-main', 'apps', 'daemon', 'bin', 'od.mjs');
  const odDist = join(projRoot(), 'open-design-main', 'apps', 'daemon', 'dist', 'cli.js');
  const ready = existsSync(odMjs) && existsSync(odDist);

  const before = JSON.stringify(cfg);
  cfg.mcp ??= {};
  migrateLegacyMcpServers(cfg);
  if (ready) {
    cfg.mcp.opendesign = {
      type: 'local',
      command: ['node', odMjs, 'mcp', 'live-artifacts'],
      enabled: true,
      timeout: 60000,
    };
  } else {
    delete cfg.mcp.opendesign;
    if (cfg.mcp && Object.keys(cfg.mcp).length === 0) delete cfg.mcp;
  }
  if (JSON.stringify(cfg) !== before) {
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }
  return ready;
}

/**
 * Eski şemayı onar: çalışan OpenCode `mcp`'yi doğrudan ad→sunucu Record'u
 * bekler (ara `servers` katmanı YOK) ve `timeout` ms cinsinden tam sayıdır
 * (`{startup}` nesnesi değil). Geçmişte yazılmış config'leri yerinde düzeltir.
 */
function migrateLegacyMcpServers(cfg: Record<string, any>): void {
  if (!cfg.mcp || typeof cfg.mcp !== 'object') return;
  // 1) mcp.servers.* → mcp.* (üst seviyeye taşı)
  const legacy = cfg.mcp.servers;
  if (legacy && typeof legacy === 'object') {
    for (const [name, srv] of Object.entries(legacy)) {
      cfg.mcp[name] ??= srv;
    }
    delete cfg.mcp.servers;
  }
  // 2) timeout: {startup: N} → timeout: N  (her sunucuda)
  for (const [key, srv] of Object.entries(cfg.mcp)) {
    if (srv && typeof srv === 'object' && (srv as any).timeout && typeof (srv as any).timeout === 'object') {
      const t = (srv as any).timeout;
      (srv as any).timeout = typeof t.startup === 'number' ? t.startup : 60000;
    }
  }
}

/** packages/caphlon/opencode-profile (our config + theme source of truth) */
function profileDir(): string {
  return resolve(import.meta.dirname, '..', '..', 'opencode-profile');
}

/**
 * Profilin opencode.json'ı git'te İZLENMEZ (reconcile* çalışma anında içine
 * makineye özgü mutlak yollar yazar). Taze klonda izlenen şablondan üretilir;
 * var olan dosyaya ASLA dokunulmaz (reconcile mutasyonları kalıcıdır).
 */
export function ensureProfileConfig(profile: string): boolean {
  const cfgPath = join(profile, 'opencode.json');
  if (existsSync(cfgPath)) return false;
  const template = join(profile, 'opencode.template.json');
  if (!existsSync(template)) return false;
  writeFileSync(cfgPath, readFileSync(template, 'utf8'));
  return true;
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
  migrateLegacyMcpServers(cfg);

  if (bin) {
    cfg.mcp.tokenless = {
      type: 'local',
      command: [bin, 'mcp-server'],
      enabled: true,
      timeout: 60000,
    };
  } else {
    delete cfg.mcp.tokenless;
    if (cfg.mcp && Object.keys(cfg.mcp).length === 0) delete cfg.mcp;
  }

  if (JSON.stringify(cfg) !== before) {
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }
  return !!bin;
}

/**
 * Kapsamlı kod düzenleme: gerçek Aider'ı stdio MCP köprüsüyle (mcp/aider-mcp)
 * OpenCode'a araç olarak bağla — "reddit gibi site tasarla" nasıl opendesign'ı
 * tetikliyorsa, çok-dosyalı iş de aider_edit'i tetikler. Komutla AYNI kontrol
 * (resolveAiderLauncher): aider gerçekten çalışmıyorsa girdi temizlenir.
 */
export function reconcileAiderMcp(profile: string): boolean {
  const cfgPath = join(profile, 'opencode.json');
  if (!existsSync(cfgPath)) return false;
  let cfg: Record<string, any>;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, any>;
  } catch {
    return false;
  }
  // Köprü derlenmiş dosya olarak var olmalı (dist/commands → dist/mcp).
  const bridge = resolve(import.meta.dirname, '..', 'mcp', 'aider-mcp.js');
  const ready = existsSync(bridge) && resolveAiderLauncher() !== null;

  const before = JSON.stringify(cfg);
  cfg.mcp ??= {};
  migrateLegacyMcpServers(cfg);
  if (ready) {
    cfg.mcp.aider = {
      type: 'local',
      command: ['node', bridge],
      enabled: true,
      timeout: 600000, // aider koşusu dakikalar sürebilir
    };
  } else {
    delete cfg.mcp.aider;
    if (cfg.mcp && Object.keys(cfg.mcp).length === 0) delete cfg.mcp;
  }
  if (JSON.stringify(cfg) !== before) {
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }
  return ready;
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

/** Prefer our customized source via Bun; fall back to the installed binary.
 *  Export'lu: doctor da AYNI kontrolü kullanır (node_modules şartı dahil). */
export function resolveLauncher(): Launcher | null {
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
  ensureProfileConfig(profile); // taze klonda opencode.json'ı şablondan üret
  if (existsSync(join(profile, 'tui.json'))) {
    env.OPENCODE_CONFIG_DIR = profile;
  }

  // Maksimum token tasarrufu: tokenless varsa MCP olarak bağla (yoksa temizle).
  const tokenlessOn = reconcileTokenlessMcp(profile);

  // Skill katmanı: indeksi profile yaz + opencode instructions'a bağla.
  const skillCount = reconcileSkillsInstruction(profile);

  // Tasarım yetenekleri: Open Design MCP'sini otomatik bağla (derliyse).
  const designOn = reconcileOpenDesignMcp(profile);

  // Kapsamlı kod düzenleme: gerçek Aider'ı araç olarak bağla (kuruluysa) —
  // kullanıcı komut ezberlemez, ajan gerektiğinde aider_edit'i kendisi çağırır.
  const aiderOn = reconcileAiderMcp(profile);

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

  if (skillCount > 0) {
    console.log(chalk.green(`   🧩 ${skillCount} skill bağlandı — model gerektiğinde ilgili SKILL.md'yi okur`));
  } else {
    console.log(chalk.gray('   🧩 skill yok → `caphlon skill add <repo>`'));
  }
  if (designOn) {
    console.log(chalk.green('   🎨 Open Design araçları bağlandı (tasarım/live-artifact otomatik)'));
  }
  if (aiderOn) {
    console.log(chalk.green('   🤝 Aider bağlandı (kapsamlı kod değişikliğinde aider_edit otomatik)'));
  }
  console.log('');

  args.push(...passthrough);
  const child = spawnSync(launcher.cmd, args, { stdio: 'inherit', env, cwd: launcher.cwd });
  if (child.status && child.status !== 0) process.exitCode = child.status;
}
