/**
 * caphlon vault — kasa yönetimi (Obsidian'sız, token-verimli bilgi katmanı).
 *
 *   caphlon vault index    Ucuz indeksi göster (ajanın gördüğü şey)
 *   caphlon vault stats    Tasarruf ölçümü: indeks vs tam kasa
 *   caphlon vault add ...  Elle not ekle (ajan zaten vault_write kullanır)
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import {
  loadAll, loadNotes, renderIndex, savings, slugify, vaultDirs, writeNote, writeIndexFile, short, estTokens,
} from '../vault/vault.js';
import { heading, kv, paint } from '../ui/theme.js';

export async function vaultCommand(sub: string | undefined, args: string[]): Promise<void> {
  const dirs = vaultDirs();

  if (sub === 'index') {
    const notes = loadAll();
    console.log('\n' + heading('Kasa İndeksi (ajanın gördüğü)') + '\n');
    console.log(notes.length ? renderIndex(notes) : paint.dim('(kasa boş — caphlon vault add ile başla)'));
    console.log('');
    return;
  }

  if (sub === 'stats') {
    const p = loadNotes(dirs.project);
    const g = loadNotes(dirs.global);
    const all = loadAll();
    const s = savings(all);
    console.log('\n' + heading('Kasa — token verimliliği') + '\n');
    console.log(kv('Proje', `${p.length} not · ${short(dirs.project)}`));
    console.log(kv('Global', `${g.length} not · ${short(dirs.global)}`));
    console.log(kv('İndeks', `~${s.indexTokens} token (ajana her seferinde bu gider)`));
    console.log(kv('Tam kasa', `~${s.fullTokens} token (hepsini bağlama koysaydık)`));
    console.log(
      kv('Tasarruf', s.fullTokens > 0
        ? paint.green(`%${(s.ratio * 100).toFixed(0)} — indeks + 1 not okumak, tamamını okumaktan bu kadar ucuz`)
        : paint.dim('ölçüm için önce not ekle')),
    );
    console.log('');
    return;
  }

  if (sub === 'add') {
    const title = args[0];
    const hook = args[1];
    const body = args.slice(2).join(' ');
    if (!title || !hook || !body) {
      console.log('Kullanım: caphlon vault add "<başlık>" "<tek satır kanca>" "<gövde>"');
      process.exitCode = 1;
      return;
    }
    const path = writeNote(dirs.project, { slug: slugify(title), title, hook, body, tags: [] });
    writeIndexFile(dirs.project, loadAll());
    console.log(chalk.green(`✓ kasaya yazıldı: ${short(path)}`));
    return;
  }

  console.log('\n🗂  caphlon vault — token-verimli bilgi kasası (Obsidian gerekmez)');
  console.log('  caphlon vault index                     Ucuz indeksi göster');
  console.log('  caphlon vault stats                     Tasarruf ölçümü (indeks vs tam kasa)');
  console.log('  caphlon vault add "<başlık>" "<kanca>" "<gövde>"');
  console.log(paint.dim('\n  Sohbette otomatik: ajan vault_index ile haritayı görür, yalnız gerekeni'));
  console.log(paint.dim('  vault_read ile açar, kalıcı bilgiyi vault_write ile yazar.'));
  console.log(paint.dim(`  Notlar düz markdown + [[bağlantı]] — istersen Obsidian'da da açılır.\n`));
}
