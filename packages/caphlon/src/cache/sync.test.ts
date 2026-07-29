/**
 * Git-Merkez testleri — skills sync test deseninin cache uyarlaması:
 * gerçek yerel bare git repo (ağsız), iki ayrı CAPHLON_HOME arasında
 * push→pull yuvarlak turu + birleşme kuralları.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GIT_AUTHOR_NAME = 'caphlon-test';
process.env.GIT_AUTHOR_EMAIL = 'test@caphlon.local';
process.env.GIT_COMMITTER_NAME = 'caphlon-test';
process.env.GIT_COMMITTER_EMAIL = 'test@caphlon.local';

const homeA = mkdtempSync(join(tmpdir(), 'caphlon-gitmerkez-A-'));
process.env.CAPHLON_HOME = homeA;

const { DualCache } = await import('./dual-cache.js');
const { cacheSyncPush, cacheSyncPull, mergePools, parsePool } = await import('./sync.js');

function makeBareRemote(): string {
  const dir = mkdtempSync(join(tmpdir(), 'caphlon-gitmerkez-remote-'));
  spawnSync('git', ['init', '--bare'], { cwd: dir });
  return dir;
}

test('mergePools: yüksek versiyon kazanır, eşitse yeni updated_at; entry_id birleşim anahtarı', () => {
  const e = (id: string, version: number, updated_at: number, output = 'x') => ({
    entry_id: id, version, instruction: 'soru bir iki uc dort', output,
    worked_count: 0, failed_count: 0, created_at: 1, updated_at,
  });
  const m = mergePools(
    [e('a', 1, 10, 'eski'), e('b', 2, 10, 'b-yerel')],
    [e('a', 2, 5, 'düzeltilmiş'), e('c', 1, 1)],
  );
  assert.equal(m.length, 3);
  assert.equal(m.find((x) => x.entry_id === 'a')!.output, 'düzeltilmiş'); // v2 > v1
  assert.equal(m.find((x) => x.entry_id === 'b')!.output, 'b-yerel'); // tek taraf
});

test('push→pull yuvarlak turu: A push eder, B temiz makinede pull ile alır; B-yereli hayatta kalır', () => {
  const remote = makeBareRemote();

  // A: iki teknik kayıt + push
  const cA = new DualCache();
  cA.record('zsh dizi bolme sorunu dongude', 'dizi kullan: arr=(...)', 'technical');
  cA.record('pnpm store prune sifir siliyor', 'once node_modules sil', 'technical');
  cA.close();
  const push = cacheSyncPush(remote, '2026-07-29T10:00:00Z');
  assert.equal(push.poolSize, 2);
  assert.equal(push.changed, true);

  // B: temiz ev + kendi yerel kaydı + pull
  const homeB = mkdtempSync(join(tmpdir(), 'caphlon-gitmerkez-B-'));
  process.env.CAPHLON_HOME = homeB;
  const cB = new DualCache();
  cB.record('b makinesine ozel yerel cozum kaydi', 'yerel cevap', 'technical');
  cB.close();
  const pull = cacheSyncPull(remote, '2026-07-29T10:05:00Z');
  assert.equal(pull.poolSize, 2);
  assert.equal(pull.added, 2);

  const cB2 = new DualCache();
  const all = cB2.exportTechnical();
  assert.equal(all.length, 3); // 2 uzaktan + 1 yerel (pull SİLMEZ, birleştirir)
  const hit = cB2.borrow('zsh dizi bolme sorunu dongude');
  assert.ok(hit && /arr=/.test(hit.output));
  cB2.close();

  process.env.CAPHLON_HOME = homeA; // sonraki testler A evinde
});

test('düzeltme yayılımı: B düzeltir+push eder, A pull ile yüksek versiyonu alır', () => {
  const remote = makeBareRemote();
  const cA = new DualCache();
  const id = cA.record('docker port cakismasi cozumu nedir birden', 'YANLIS cevap', 'technical');
  cA.close();
  cacheSyncPush(remote, '2026-07-29T11:00:00Z');

  // B: pull → düzeltme raporu (version+1) → push
  const homeB = mkdtempSync(join(tmpdir(), 'caphlon-gitmerkez-B2-'));
  process.env.CAPHLON_HOME = homeB;
  cacheSyncPull(remote, '2026-07-29T11:01:00Z');
  const cB = new DualCache();
  cB.report(id, false, 'DOGRU: HIVE_PORT env ile degistir');
  cB.close();
  cacheSyncPush(remote, '2026-07-29T11:02:00Z');

  // A: pull → düzeltilmiş hali görmeli
  process.env.CAPHLON_HOME = homeA;
  const r = cacheSyncPull(remote, '2026-07-29T11:03:00Z');
  assert.equal(r.updated, 1);
  const cA2 = new DualCache();
  const hit = cA2.borrow('docker port cakismasi cozumu nedir birden');
  assert.match(hit!.output, /DOGRU/);
  cA2.close();
});

test('içe aktarımda sır taraması: havuzdaki sızıntılı satır yerele GİRMEZ', () => {
  const c = new DualCache();
  const res = c.importEntries([
    {
      entry_id: 'kotu-1', version: 1, instruction: 'anahtar sorusu bir iki uc',
      output: 'AKIAABCDEFGHIJKLMNOP kullan', worked_count: 0, failed_count: 0,
      created_at: 1, updated_at: 1,
    },
  ]);
  assert.equal(res.skippedSecret, 1);
  assert.equal(res.added, 0);
  c.close();
});

test('parsePool: bozuk satırlar atlanır', () => {
  const good = JSON.stringify({ entry_id: 'x', version: 1, instruction: 'a b c d', output: 'o', worked_count: 0, failed_count: 0, created_at: 1, updated_at: 1 });
  const pool = parsePool(good + '\n{bozuk\n\n' + good.replace('"x"', '"y"') + '\n');
  assert.equal(pool.length, 2);
});
