/**
 * caphlon tools — Cihazdaki AI araçlarını bul ve caphlon gateway'ine bağla.
 *
 *   caphlon tools             Kurulu araçları + bağlantı durumunu göster
 *   caphlon tools link [id]   Araç(lar)ı gateway'e bağla (yedekli)
 *   caphlon tools unlink [id] Bağlantıyı kaldır (yedekten geri al)
 */

import chalk from 'chalk';
import { getActiveModel, aiderModelString } from '../config/active.js';
import { DEFAULT_GATEWAY, detectTools, getAdapter, ADAPTERS } from '../config/tools.js';

function listCmd(): void {
  const tools = detectTools();
  console.log(chalk.bold('\n🔌 AI araçları\n'));
  for (const t of tools) {
    const inst = t.installed ? chalk.green('kurulu') : chalk.gray('yok');
    const link = t.linked ? chalk.cyan('● bağlı') : chalk.gray('○ bağlı değil');
    console.log(`  ${t.installed ? '✓' : '·'} ${chalk.bold(t.name)}  [${inst}] ${link}`);
    if (t.installed) console.log(chalk.gray(`     ${t.configPath}`));
  }
  console.log(chalk.gray('\n  Bağla:  caphlon tools link    |    Kaldır:  caphlon tools unlink'));
  console.log(chalk.gray('  Not: bağlantı için gateway çalışmalı →  caphlon serve\n'));
}

function linkCmd(id?: string): void {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce:  caphlon connect'));
    process.exitCode = 1;
    return;
  }
  const model = aiderModelString(active);
  const targets = id ? ADAPTERS.filter((a) => a.id === id) : ADAPTERS.filter((a) => a.detect());
  if (targets.length === 0) {
    console.log(chalk.yellow(id ? `\n"${id}" bulunamadı/kurulu değil.\n` : '\nKurulu araç yok.\n'));
    return;
  }
  console.log(chalk.bold(`\n🔗 Gateway'e bağlanıyor — ${chalk.cyan(model)} → ${DEFAULT_GATEWAY}\n`));
  for (const a of targets) {
    try {
      a.link(DEFAULT_GATEWAY, model);
      console.log(chalk.green(`  ✓ ${a.name} bağlandı`));
      console.log(chalk.gray(`     ${a.configPath()}  (yedek: *.caphlon-bak)`));
    } catch (e) {
      console.log(chalk.red(`  ✖ ${a.name}: ${(e as Error).message}`));
    }
  }
  console.log(chalk.gray('\n  Gateway\'i başlat:  caphlon serve\n'));
}

function unlinkCmd(id?: string): void {
  const targets = id ? ADAPTERS.filter((a) => a.id === id) : ADAPTERS;
  console.log(chalk.bold('\n🔓 Bağlantı kaldırılıyor\n'));
  let any = false;
  for (const a of targets) {
    if (!a.isLinked()) continue;
    any = true;
    try {
      a.unlink();
      console.log(chalk.green(`  ✓ ${a.name} bağlantısı kaldırıldı`));
    } catch (e) {
      console.log(chalk.red(`  ✖ ${a.name}: ${(e as Error).message}`));
    }
  }
  if (!any) console.log(chalk.gray('  Bağlı araç yok.'));
  console.log('');
}

export async function toolsCommand(action?: string, id?: string): Promise<void> {
  switch (action) {
    case undefined:
    case 'list':
      return listCmd();
    case 'link':
      return linkCmd(id);
    case 'unlink':
      return unlinkCmd(id);
    default:
      console.error(chalk.red(`✖ Bilinmeyen alt-komut: ${action}`));
      console.log(chalk.gray('  list | link | unlink'));
      process.exitCode = 1;
  }
}
