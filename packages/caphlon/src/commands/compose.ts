/**
 * caphlon compose — Compose mode, gerçek MiMo Code ile.
 *
 * MiMo Code'u (Bun tabanlı, opencode-fork) sıfırdan yazmaz; indirilen gerçek
 * projeyi (MiMo-Code-main) `compose` ajanıyla başlatır ve `caphlon connect` ile
 * bağlı modeli ortam değişkenleriyle geçirir. MiMo'nun "en iyi yanı" — kalıcı
 * hafıza + 8-aşamalı specs-driven compose workflow — buradan kullanılır.
 *
 *   caphlon compose start "<açıklama>"   Compose ajanını bu görevle başlat
 *   caphlon compose list                  Aşamaları göster
 *   caphlon compose resume                MiMo'yu aç (oturum seçiciyle devam)
 */

import { join } from 'node:path';
import chalk from 'chalk';
import { getActiveModel, activeModelEnv, opencodeModelString } from '../config/active.js';
import { findBun, firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';

const COMPOSE_STAGES = [
  { name: 'brainstorm', emoji: '💡', desc: 'Gereksinim analizi & spesifikasyon' },
  { name: 'spec',       emoji: '📝', desc: 'Teknik spesifikasyon & görev dökümü' },
  { name: 'implement',  emoji: '🔨', desc: 'Kod yaz & test ekle' },
  { name: 'review',     emoji: '👁️',  desc: 'Kod incelemesi & kalite kontrol' },
  { name: 'tdd',        emoji: '🧪', desc: 'Test-driven development' },
  { name: 'debug',      emoji: '🐛', desc: 'Hata ayıkla & düzelt' },
  { name: 'verify',     emoji: '✅', desc: 'Typecheck, test, lint, build' },
  { name: 'merge',      emoji: '🔀', desc: 'Değişiklikleri birleştir & temizle' },
];

/** İndirilen MiMo Code dizinini bul. */
function findMimoDir(): string | null {
  return firstExisting(
    join(projectRoot(), 'MiMo-Code-main'),
    join(projectRoot(), 'core', 'MiMo-Code-main'),
  );
}

/** Gerçek MiMo'yu nasıl başlatacağımıza karar ver: PATH binary → bundled (Bun). */
function resolveLauncher(): { cmd: string; baseArgs: string[]; cwd?: string } | null {
  // 1. Kurulu `mimo` (npm i -g @mimo-ai/cli)
  if (onPath('mimo')) return { cmd: 'mimo', baseArgs: [] };

  // 2. Bundled kaynak: MiMo'nun kendi dev çağrısını birebir aynala.
  const dir = findMimoDir();
  const bun = findBun();
  if (dir && bun && firstExisting(join(dir, 'packages', 'opencode', 'script', 'dev.ts'))) {
    return { cmd: bun, baseArgs: ['run', '--cwd', 'packages/opencode', 'script/dev.ts'], cwd: dir };
  }
  return null;
}

export async function composeCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'start':
      await handleComposeStart(args);
      break;
    case 'list':
      handleComposeList();
      break;
    case 'resume':
      await launchMimo([], 'compose');
      break;
    default:
      showComposeHelp();
  }
}

async function handleComposeStart(args: string[]): Promise<void> {
  const description = args.join(' ').trim();
  if (!description) {
    console.log('❌ Ne inşa etmek istediğini yaz.  Kullanım: caphlon compose start <açıklama>\n');
    return;
  }

  console.log(chalk.bold('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.bold('║     Caphlon Compose — MiMo Code akışı     ║'));
  console.log(chalk.bold('╚══════════════════════════════════════════╝\n'));
  console.log(`📋 Görev: ${chalk.cyan(description)}\n`);
  for (let i = 0; i < COMPOSE_STAGES.length; i++) {
    const s = COMPOSE_STAGES[i];
    console.log(`  ${s.emoji} ${i + 1}. ${s.name} — ${chalk.gray(s.desc)}`);
  }
  console.log('');

  await launchMimo(['--prompt', description], 'compose');
}

/** Gerçek MiMo'yu compose ajanıyla, bağlı modelle başlat. */
async function launchMimo(extraArgs: string[], agent: string): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }

  const launcher = resolveLauncher();
  if (!launcher) {
    notFound('MiMo Code', [
      'npm install -g @mimo-ai/cli',
      'veya bundled sürüm için Bun kur (https://bun.sh) + MiMo-Code-main bağımlılıklarını yükle',
    ]);
    return;
  }

  // MiMo bir OpenCode fork'u: modeli hem --model bayrağıyla (provider/model) hem
  // de ortam değişkenleriyle (ANTHROPIC_API_KEY vb.) geçir → manuel onboarding yok.
  // --trust workspace güven sorusunu atlar (akışı kesmesin).
  const modelStr = opencodeModelString(active);
  const args = [...launcher.baseArgs, '--model', modelStr, '--agent', agent, '--trust', ...extraArgs];
  console.log(chalk.bold(`🐙 MiMo Compose — ${chalk.cyan(modelStr)}`));
  console.log(chalk.gray('   caphlon connect ile bağlı model kullanılıyor\n'));

  spawnInherit(launcher.cmd, args, activeModelEnv(), launcher.cwd);
}

function handleComposeList(): void {
  console.log('\n📋 Caphlon Compose — Aşamalar (MiMo Code):\n');
  for (let i = 0; i < COMPOSE_STAGES.length; i++) {
    const s = COMPOSE_STAGES[i];
    console.log(`  ${i + 1}. ${s.emoji} ${s.name} — ${chalk.gray(s.desc)}`);
  }
  console.log('\nKullanım:');
  console.log('  caphlon compose start <açıklama>   Yeni compose akışı başlat');
  console.log('  caphlon compose resume              MiMo oturum seçiciyle devam et\n');
}

function showComposeHelp(): void {
  console.log('\n📋 Caphlon Compose (MiMo Code) komutları:');
  console.log('  caphlon compose start <açıklama>   Compose ajanını bu görevle başlat');
  console.log('  caphlon compose list                Aşamaları göster');
  console.log("  caphlon compose resume              MiMo'yu aç (oturumla devam)\n");
}
