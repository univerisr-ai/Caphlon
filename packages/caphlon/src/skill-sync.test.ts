/**
 * skill sync — push/pull round-trip (yerel bare git repo ile, AĞ YOK).
 *
 * P1-1 regresyonunu kilitler: öğrenilen skill'ler bir git reposuna gerçekten
 * gönderilir ve TEMİZ bir makineye geri çekilir. "Faz 2 henüz etkin değil"
 * placeholder'ının yerine geçen gerçek davranışı doğrular.
 *
 * Çalıştır:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// git commit için deterministik kimlik (CI'da global config olmayabilir).
process.env.GIT_AUTHOR_NAME = 'Caphlon Test';
process.env.GIT_AUTHOR_EMAIL = 'test@caphlon.local';
process.env.GIT_COMMITTER_NAME = 'Caphlon Test';
process.env.GIT_COMMITTER_EMAIL = 'test@caphlon.local';

const root = mkdtempSync(join(tmpdir(), 'caphlon-sync-'));
const homeA = join(root, 'homeA'); // "1. makine" (üreten)
const homeB = join(root, 'homeB'); // "2. makine" (çeken)
const bare = join(root, 'remote.git'); // uzak depo (bare)

// Bare uzak depoyu hazırla.
mkdirSync(bare, { recursive: true });
assert.equal(spawnSync('git', ['init', '--bare', bare]).status, 0, 'bare init');

process.env.CAPHLON_HOME = homeA;
const A = await import('./config/skills.js');

test('push: öğrenilen skill uzak repoya gönderilir', async () => {
  process.env.CAPHLON_HOME = homeA;
  A.recordLearning({
    title: 'Test Dersi',
    description: 'bir ders',
    whenToUse: 'her zaman',
    body: 'gövde içeriği',
    createdAt: '2026-06-29T00:00:00Z',
  });
  const r = A.syncPush(bare, '2026-06-29T00:00:00Z');
  assert.equal(r.changed, true, 'değişiklik push edilmeli');
  assert.equal(r.pushed, 1, '1 learned skill');
});

test('push tekrar: değişiklik yoksa changed=false', async () => {
  process.env.CAPHLON_HOME = homeA;
  const r = A.syncPush(undefined, '2026-06-29T00:01:00Z'); // remote saklandı
  assert.equal(r.changed, false, 'idempotent — yeni commit yok');
});

test('pull: temiz makineye uzak skill gelir', async () => {
  // caphlonHome() env'i her çağrıda okur → re-import gerekmez, sadece HOME'u değiştir.
  process.env.CAPHLON_HOME = homeB; // hiç skill'i olmayan yeni makine
  assert.equal(A.listSkills().length, 0, 'B başta boş');
  const r = A.syncPull(bare, '2026-06-29T00:02:00Z');
  assert.equal(r.pulled, 1, 'uzaktan 1 skill çekildi');
  const names = A.listSkills().map((s) => s.name);
  assert.ok(names.includes('Test Dersi'), `çekilen skill listede olmalı: ${names.join(',')}`);
});

test.after(() => {
  rmSync(root, { recursive: true, force: true });
});
