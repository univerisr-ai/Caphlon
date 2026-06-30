/**
 * caphlon skill — Skill deposu & öğrenme katmanı.
 *
 * Bu katman bir model çalıştırmaz; aynı modeli daha iyi yapan bilgiyi yönetir.
 * GitHub'dan skill çeker (git shell-out), yerelde indeksler ve görev anında
 * ilgili skill'leri araçlara (aider/opencode/od) bağlam olarak enjekte eder.
 *
 *   caphlon skill list                 Yerel skill'leri göster
 *   caphlon skill add <repo|path>      GitHub repo / yerel dizinden ekle
 *   caphlon skill search <konu>        İndekste ara
 *   caphlon skill show <id>            Bir skill'in SKILL.md'sini göster
 *   caphlon skill learn <başlık>       Bir dersi kaydet (--desc/--body)
 *   caphlon skill sync                 Senkron durumu (Faz 2 — şimdilik yerel)
 */

import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import {
  listSkills,
  addFromGit,
  addFromPath,
  selectRelevant,
  recordLearning,
  syncStatus,
  syncPush,
  syncPull,
  skillsHome,
} from '../config/skills.js';

function nowIso(): string {
  return new Date().toISOString();
}

function listCmd(): void {
  const skills = listSkills();
  if (skills.length === 0) {
    console.log(chalk.gray('\nHenüz skill yok.'));
    console.log(chalk.gray('  Ekle:  caphlon skill add anthropics/skills'));
    console.log(chalk.gray(`  Konum: ${skillsHome()}\n`));
    return;
  }
  console.log(chalk.bold(`\n🧩 Skill'ler (${skills.length})\n`));
  const bySource = new Map<string, typeof skills>();
  for (const s of skills) {
    if (!bySource.has(s.source)) bySource.set(s.source, []);
    bySource.get(s.source)!.push(s);
  }
  for (const [source, group] of bySource) {
    console.log(chalk.cyan(`  ${source}`));
    for (const s of group) {
      const desc = s.description ? chalk.gray(` — ${s.description.slice(0, 70)}`) : '';
      console.log(`    • ${chalk.bold(s.name)}${desc}`);
    }
  }
  console.log('');
}

function addCmd(target: string): void {
  if (!target) {
    console.error(chalk.red('✖ Kaynak gerekli:  caphlon skill add <github-repo|yerel-yol>'));
    process.exitCode = 1;
    return;
  }
  const isLocal = target.startsWith('.') || target.startsWith('/') || target.startsWith('~');
  try {
    const r = isLocal ? addFromPath(target, nowIso()) : addFromGit(target, nowIso());
    console.log(
      chalk.green(`\n✓ "${r.source}" eklendi — ${r.skillCount} skill bulundu.`),
    );
    console.log(chalk.gray(`  ${r.dest}\n`));
  } catch (e) {
    console.error(chalk.red(`\n✖ Eklenemedi: ${(e as Error).message}\n`));
    process.exitCode = 1;
  }
}

function searchCmd(query: string): void {
  if (!query) {
    console.error(chalk.red('✖ Arama terimi gerekli:  caphlon skill search <konu>'));
    process.exitCode = 1;
    return;
  }
  const hits = selectRelevant(query, 10);
  if (hits.length === 0) {
    console.log(chalk.gray(`\n"${query}" için skill bulunamadı.\n`));
    return;
  }
  console.log(chalk.bold(`\n🔎 "${query}" — ${hits.length} sonuç\n`));
  for (const s of hits) {
    console.log(`  • ${chalk.bold(s.name)} ${chalk.gray(`(${s.source})`)}`);
    if (s.description) console.log(chalk.gray(`    ${s.description.slice(0, 80)}`));
    console.log(chalk.gray(`    ${s.id}`));
  }
  console.log('');
}

function showCmd(id: string): void {
  if (!id) {
    console.error(chalk.red('✖ Skill id gerekli:  caphlon skill show <id>'));
    process.exitCode = 1;
    return;
  }
  const skills = listSkills();
  const hit = skills.find((s) => s.id === id || s.name === id);
  if (!hit) {
    console.error(chalk.red(`✖ Skill bulunamadı: ${id}`));
    process.exitCode = 1;
    return;
  }
  console.log('\n' + readFileSync(hit.path, 'utf8') + '\n');
}

function learnCmd(title: string, opts: { desc?: string; when?: string; body?: string }): void {
  if (!title) {
    console.error(chalk.red('✖ Başlık gerekli:  caphlon skill learn "<başlık>" --body "..."'));
    process.exitCode = 1;
    return;
  }
  const path = recordLearning({
    title,
    description: opts.desc ?? '',
    whenToUse: opts.when ?? '',
    body: opts.body ?? '',
    createdAt: nowIso(),
  });
  console.log(chalk.green(`\n✓ Ders kaydedildi:\n  ${path}\n`));
}

function syncStatusCmd(): void {
  const st = syncStatus();
  console.log(chalk.bold('\n🔄 Skill senkron durumu\n'));
  console.log(`  Konum:        ${chalk.gray(st.skillsHome)}`);
  console.log(`  Toplam skill: ${chalk.bold(String(st.totalSkills))}`);
  console.log(`  Öğrenilen:    ${chalk.bold(String(st.learnedCount))}`);
  console.log(`  Kaynaklar:    ${st.sources.length}`);
  for (const s of st.sources) console.log(chalk.gray(`    • ${s.source} ← ${s.origin}`));
  console.log(`  Uzak depo:    ${st.remote ? chalk.cyan(st.remote) : chalk.gray('tanımlı değil')}`);
  if (st.lastPushAt) console.log(chalk.gray(`  Son push:     ${st.lastPushAt}`));
  if (st.lastPullAt) console.log(chalk.gray(`  Son pull:     ${st.lastPullAt}`));
  console.log(
    chalk.gray(
      '\n  Push/Pull:  caphlon skill sync push <owner/repo>  ·  caphlon skill sync pull\n',
    ),
  );
}

function syncCmd(sub: string | undefined, repo: string | undefined): void {
  if (sub === 'push') {
    try {
      const r = syncPush(repo, nowIso());
      if (!r.changed) {
        console.log(chalk.gray(`\n✓ Zaten güncel — ${r.pushed} learned skill (${r.remote}).\n`));
      } else {
        console.log(chalk.green(`\n✓ Push edildi: ${r.pushed} learned skill → ${r.remote}\n`));
      }
    } catch (e) {
      console.error(chalk.red(`\n✖ Push başarısız: ${(e as Error).message}\n`));
      process.exitCode = 1;
    }
    return;
  }
  if (sub === 'pull') {
    try {
      const r = syncPull(repo, nowIso());
      console.log(chalk.green(`\n✓ Pull edildi: ${r.pulled} learned skill ← ${r.remote}\n`));
    } catch (e) {
      console.error(chalk.red(`\n✖ Pull başarısız: ${(e as Error).message}\n`));
      process.exitCode = 1;
    }
    return;
  }
  if (sub && sub !== 'status') {
    console.error(chalk.red(`✖ Bilinmeyen sync alt-komutu: ${sub}`));
    console.log(chalk.gray('  caphlon skill sync [status] | push <owner/repo> | pull'));
    process.exitCode = 1;
    return;
  }
  syncStatusCmd();
}

export async function skillCommand(
  action: string | undefined,
  arg: string | undefined,
  opts: { desc?: string; when?: string; body?: string } = {},
  extra?: string,
): Promise<void> {
  switch (action) {
    case undefined:
    case 'list':
      return listCmd();
    case 'add':
      return addCmd(arg ?? '');
    case 'search':
      return searchCmd(arg ?? '');
    case 'show':
      return showCmd(arg ?? '');
    case 'learn':
      return learnCmd(arg ?? '', opts);
    case 'sync':
      return syncCmd(arg, extra);
    default:
      console.error(chalk.red(`✖ Bilinmeyen alt-komut: ${action}`));
      console.log(chalk.gray('  list | add | search | show | learn | sync'));
      process.exitCode = 1;
  }
}
