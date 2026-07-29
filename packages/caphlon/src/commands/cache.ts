/**
 * caphlon cache — token-tasarruf havuzunun yönetimi (Git-Merkez senkronu).
 *
 *   caphlon cache sync push [owner/repo]   Teknik havuzu git reposuna gönder (+tam senkron)
 *   caphlon cache sync pull [owner/repo]   Repodaki havuzu yerele birleştir
 *   caphlon cache stats                    Havuz sayaçları
 */

import chalk from 'chalk';
import { DualCache } from '../cache/dual-cache.js';
import { cacheSyncPush, cacheSyncPull, loadCacheSyncState } from '../cache/sync.js';

export async function cacheCommand(sub: string | undefined, args: string[]): Promise<void> {
  if (!DualCache.available()) {
    console.error(chalk.red('✖ cache devre dışı: node:sqlite yok (Node 22.13+/23.4+ gerekir)'));
    process.exitCode = 1;
    return;
  }

  if (sub === 'stats') {
    const c = new DualCache();
    try {
      const s = c.stats();
      const st = loadCacheSyncState();
      console.log(`\n🧠 Cache: ${s.technical} teknik + ${s.personal} kişisel kayıt`);
      console.log(`   Ödünç: ${s.borrows} · başarı: ${s.worked} · başarısız: ${s.failed}`);
      console.log(`   Tahmini tasarruf: ~${s.estTokensSaved.toLocaleString('en-US')} token`);
      console.log(
        `   Git-Merkez: ${st.remote ?? '⬜ yok (caphlon cache sync push <owner/repo>)'}` +
          (st.lastPushAt ? `\n   Son push: ${st.lastPushAt}` : '') +
          (st.lastPullAt ? `\n   Son pull: ${st.lastPullAt}` : '') +
          '\n',
      );
    } finally {
      c.close();
    }
    return;
  }

  if (sub === 'sync') {
    const action = args[0];
    const repo = args[1];
    const at = new Date().toISOString();
    try {
      if (action === 'push') {
        const r = cacheSyncPush(repo, at);
        console.log(
          chalk.green(`✓ Git-Merkez push: havuz ${r.poolSize} kayıt (${r.remote})`) +
            chalk.gray(
              `\n  yerele birleşen: +${r.added} yeni, ${r.updated} güncellendi` +
                (r.skippedSecret ? `, ${r.skippedSecret} sır nedeniyle atlandı` : '') +
                (r.changed ? '' : ' · uzakta değişiklik yoktu'),
            ),
        );
        return;
      }
      if (action === 'pull') {
        const r = cacheSyncPull(repo, at);
        console.log(
          chalk.green(`✓ Git-Merkez pull: havuz ${r.poolSize} kayıt (${r.remote})`) +
            chalk.gray(
              `\n  yerele birleşen: +${r.added} yeni, ${r.updated} güncellendi` +
                (r.skippedSecret ? `, ${r.skippedSecret} sır nedeniyle atlandı` : ''),
            ),
        );
        return;
      }
    } catch (e) {
      console.error(chalk.red(`✖ ${e instanceof Error ? e.message : String(e)}`));
      process.exitCode = 1;
      return;
    }
  }

  console.log('\n🧠 caphlon cache — token-tasarruf havuzu');
  console.log('  caphlon cache stats                    Sayaçlar + Git-Merkez durumu');
  console.log('  caphlon cache sync push [owner/repo]   Teknik havuzu git reposuna gönder');
  console.log('  caphlon cache sync pull [owner/repo]   Repodaki havuzu yerele birleştir');
  console.log(chalk.gray('  Kişisel havuz ASLA senkrona girmez; içe aktarımda sır taraması çalışır.\n'));
}
