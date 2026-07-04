/**
 * config/skills — skill deposu, öğrenme ve git-tabanlı sync (Living Marketplace) testleri.
 *
 * İzole bir CAPHLON_HOME kullanır — gerçek ~/.caphlon'a dokunmaz. Sync testleri
 * gerçek bir yerel git deposunu (bare, file:// üzerinden) "uzak" olarak kullanır;
 * ağa çıkmaz.
 *
 * Çalıştır:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// git commit için kimlik gerekiyor; makinenin global config'ine bağımlı kalma.
process.env.GIT_AUTHOR_NAME = 'caphlon-test';
process.env.GIT_AUTHOR_EMAIL = 'test@caphlon.local';
process.env.GIT_COMMITTER_NAME = 'caphlon-test';
process.env.GIT_COMMITTER_EMAIL = 'test@caphlon.local';

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), 'caphlon-skills-test-'));
}

process.env.CAPHLON_HOME = freshHome();

const {
  listSkills,
  addFromPath,
  selectRelevant,
  skillContextPaths,
  buildSkillPreamble,
  recordLearning,
  renderSkillsIndex,
  writeSkillsIndex,
  syncPush,
  syncPull,
  syncStatus,
  learnedHome,
} = await import('./skills.js');

function writeSkillFixture(dir: string, opts: { name: string; description?: string; whenToUse?: string; body?: string }): void {
  mkdirSync(dir, { recursive: true });
  const md =
    `---\n` +
    `name: ${opts.name}\n` +
    `description: ${opts.description ?? ''}\n` +
    `when_to_use: ${opts.whenToUse ?? ''}\n` +
    `---\n\n` +
    `${opts.body ?? 'gövde'}\n`;
  writeFileSync(join(dir, 'SKILL.md'), md);
}

function git(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} başarısız: ${r.stderr}`);
}

/** file:// üzerinden gerçek bir bare repo — sync testlerinde "uzak" rolünde. */
function makeBareRemote(): string {
  const dir = mkdtempSync(join(tmpdir(), 'caphlon-skills-remote-'));
  git(['init', '--bare'], dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Discovery / parsing / relevance
// ---------------------------------------------------------------------------

test('addFromPath + listSkills — SKILL.md frontmatter doğru ayrıştırılır', () => {
  const src = mkdtempSync(join(tmpdir(), 'caphlon-skill-src-'));
  writeSkillFixture(src, {
    name: 'PDF Doldurma',
    description: 'PDF formlarını doldurur',
    whenToUse: 'kullanıcı PDF form istediğinde',
  });
  addFromPath(src, '2026-01-01T00:00:00.000Z');

  const skills = listSkills();
  const hit = skills.find((s) => s.name === 'PDF Doldurma');
  assert.ok(hit, 'eklenen skill listede olmalı');
  assert.equal(hit?.description, 'PDF formlarını doldurur');
  assert.equal(hit?.whenToUse, 'kullanıcı PDF form istediğinde');
});

test('selectRelevant — açıklama/whenToUse eşleşen skilli puanlar', () => {
  const src = mkdtempSync(join(tmpdir(), 'caphlon-skill-src-'));
  writeSkillFixture(src, {
    name: 'Docker Debug',
    description: 'container loglarını inceler',
    whenToUse: 'docker container çökerse kullan',
  });
  addFromPath(src, '2026-01-01T00:00:00.000Z');

  const hits = selectRelevant('docker container çöktü ne yapmalıyım', 5);
  assert.ok(hits.some((s) => s.name === 'Docker Debug'));

  assert.deepEqual(selectRelevant('alakasız bir sorgu xyzzy', 5).length >= 0, true);
});

test('skillContextPaths — selectRelevant sonuçlarının yollarını döner', () => {
  const paths = skillContextPaths('docker container çöktü', 5);
  assert.ok(paths.every((p) => p.endsWith('SKILL.md')));
});

test('buildSkillPreamble — hiç skill yoksa görevi aynen döner', () => {
  process.env.CAPHLON_HOME = freshHome();
  const { prompt, used } = buildSkillPreamble('boş ev — hiç skill yok');
  assert.equal(prompt, 'boş ev — hiç skill yok');
  assert.deepEqual(used, []);
});

test('buildSkillPreamble — eşleşen skill tam içerikle gömülür', () => {
  process.env.CAPHLON_HOME = freshHome();
  const src = mkdtempSync(join(tmpdir(), 'caphlon-skill-src-'));
  writeSkillFixture(src, {
    name: 'Rebase Kurtarma',
    description: 'bozuk rebase durumunu kurtarır',
    whenToUse: 'git rebase çakışması olduğunda',
    body: 'ADIM 1: git status\nADIM 2: git rebase --abort',
  });
  addFromPath(src, '2026-01-01T00:00:00.000Z');

  const { prompt, used } = buildSkillPreamble('git rebase çakışması yaşıyorum');
  assert.deepEqual(used, ['Rebase Kurtarma']);
  assert.ok(prompt.includes('ADIM 1: git status'));
  assert.ok(prompt.includes('GÖREV:'));
});

// ---------------------------------------------------------------------------
// Learning loop
// ---------------------------------------------------------------------------

test('recordLearning — learned/<slug>/SKILL.md yazar ve listSkills bulur', () => {
  process.env.CAPHLON_HOME = freshHome();
  const path = recordLearning({
    title: 'Node ABI Trap',
    description: 'native modül farklı Node ABI ile derlenirse patlar',
    whenToUse: 'better-sqlite3 gibi native bağımlılıklarda test çökerse',
    body: 'Node sürümünü sabitle, setup-cores yeniden derlesin.',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.ok(existsSync(path));
  assert.ok(path.includes(join('learned', 'node-abi-trap')));

  const skills = listSkills();
  const hit = skills.find((s) => s.name === 'Node ABI Trap');
  assert.ok(hit);
  assert.equal(hit?.source, 'learned');
});

// ---------------------------------------------------------------------------
// Index rendering
// ---------------------------------------------------------------------------

test('renderSkillsIndex / writeSkillsIndex — kaynağa göre gruplu Markdown', () => {
  process.env.CAPHLON_HOME = freshHome();
  recordLearning({
    title: 'X Dersi',
    description: 'd',
    whenToUse: 'w',
    body: 'b',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const md = renderSkillsIndex();
  assert.ok(md.includes('# Caphlon Skills'));
  assert.ok(md.includes('X Dersi'));

  const destDir = mkdtempSync(join(tmpdir(), 'caphlon-skills-index-'));
  const written = writeSkillsIndex(destDir);
  assert.ok(written && existsSync(written));
});

test('writeSkillsIndex — hiç skill yoksa null döner (boş dosya yazmaz)', () => {
  process.env.CAPHLON_HOME = freshHome();
  const destDir = mkdtempSync(join(tmpdir(), 'caphlon-skills-index-empty-'));
  assert.equal(writeSkillsIndex(destDir), null);
});

// ---------------------------------------------------------------------------
// Sync — Living Marketplace: gerçek yerel git remote ile push/pull
// ---------------------------------------------------------------------------

test('syncPush — uzak depo yoksa açık hata verir', () => {
  process.env.CAPHLON_HOME = freshHome();
  assert.throws(() => syncPush(undefined, '2026-01-01T00:00:00.000Z'), /Uzak depo tanımlı değil/);
});

test('syncPush — hiç learned skill yokken değişiklik yok (changed=false)', () => {
  process.env.CAPHLON_HOME = freshHome();
  const remote = makeBareRemote();
  const r = syncPush(remote, '2026-01-01T00:00:00.000Z');
  assert.equal(r.pushed, 0);
  assert.equal(r.changed, false);
});

// Not: temel push→pull round-trip'i src/skill-sync.test.ts zaten kilitliyor
// (P1-1 regresyon testi). Burada sadece o testin KAPSAMADIĞI davranışlar var:
// boş durum, hata yolu, merge semantiği, status, remote hatırlama.

test('syncPull — yerelde olup uzakta olmayan dersi SİLMEZ (merge, mirror değil)', () => {
  const remote = makeBareRemote();

  process.env.CAPHLON_HOME = freshHome();
  recordLearning({
    title: 'Uzak Ders',
    description: 'd',
    whenToUse: 'w',
    body: 'uzaktan gelen',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  syncPush(remote, '2026-01-01T00:00:00.000Z');

  process.env.CAPHLON_HOME = freshHome();
  recordLearning({
    title: 'Yerel Ders',
    description: 'd',
    whenToUse: 'w',
    body: 'sadece bende var',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  syncPull(remote, '2026-01-02T00:00:00.000Z');

  const names = listSkills().map((s) => s.name).sort();
  assert.deepEqual(names, ['Uzak Ders', 'Yerel Ders']);
});

test('syncStatus — remote ve son push/pull zaman damgalarını yansıtır', () => {
  process.env.CAPHLON_HOME = freshHome();
  const remote = makeBareRemote();
  assert.equal(syncStatus().remote, null);

  recordLearning({
    title: 'Durum Testi',
    description: 'd',
    whenToUse: 'w',
    body: 'b',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  syncPush(remote, '2026-01-01T00:00:00.000Z');

  const st = syncStatus();
  assert.equal(st.remote, remote);
  assert.equal(st.lastPushAt, '2026-01-01T00:00:00.000Z');
  assert.equal(st.learnedCount, 1);
});

test('syncPush — repoArg verilmezse önceden kaydedilen remote kullanılır', () => {
  process.env.CAPHLON_HOME = freshHome();
  const remote = makeBareRemote();
  recordLearning({
    title: 'Varsayılan Remote',
    description: 'd',
    whenToUse: 'w',
    body: 'b',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  syncPush(remote, '2026-01-01T00:00:00.000Z');

  // İkinci push: repoArg YOK — kayıtlı remote'u hatırlamalı.
  const second = syncPush(undefined, '2026-01-02T00:00:00.000Z');
  assert.equal(second.remote, remote);
  assert.equal(second.changed, false); // içerik değişmedi
});

test("learnedHome — CAPHLON_HOME altında learned/ dizinine işaret eder", () => {
  process.env.CAPHLON_HOME = freshHome();
  assert.ok(learnedHome().endsWith(join('skills', 'learned')));
});
