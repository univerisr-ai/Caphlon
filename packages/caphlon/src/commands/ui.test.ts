/**
 * ui.ts reconcile/migrate testleri — bu fonksiyonlar kullanıcının
 * opencode.json'ını yerinde yeniden yazar; denetimde sıfır kapsamalıydılar.
 *
 * İzolasyon: profil = geçici dizin; CAPHLON_HOME taze (skill yok).
 * Makine bağımlılığı notu: reconcileTokenlessMcp/reconcileOpenDesignMcp
 * "araç kurulu mu" kararını gerçek dosya sisteminden okur — testler bu
 * yüzden her iki dalda da geçerli olan davranışları (legacy şema migrasyonu,
 * idempotency, bozuk JSON'a dokunmama) kilitler; kuruluysa yazılan girdinin
 * şeklini ayrıca doğrular.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CAPHLON_HOME = mkdtempSync(join(tmpdir(), 'caphlon-ui-test-'));

const { reconcileSkillsInstruction, reconcileTokenlessMcp, reconcileOpenDesignMcp } =
  await import('./ui.js');

function freshProfile(cfg: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'caphlon-ui-profile-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify(cfg, null, 2));
  return dir;
}

function readCfg(dir: string): Record<string, any> {
  return JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
}

test('reconcileSkillsInstruction: skill yokken bayat SKILLS_INDEX.md girdisini temizler', () => {
  const dir = freshProfile({ instructions: ['AGENTS.md', 'SKILLS_INDEX.md'] });
  const count = reconcileSkillsInstruction(dir);
  assert.equal(count, 0);
  assert.deepEqual(readCfg(dir).instructions, ['AGENTS.md']);
});

test('reconcileSkillsInstruction: opencode.json yoksa sessizce 0 döner', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caphlon-ui-empty-'));
  assert.equal(reconcileSkillsInstruction(dir), 0);
});

test('migrateLegacyMcpServers (reconcile üzerinden): mcp.servers düzleşir, timeout sayıya iner', () => {
  const dir = freshProfile({
    mcp: {
      servers: { foo: { type: 'local', command: ['x'], timeout: { startup: 12345 } } },
    },
  });
  reconcileTokenlessMcp(dir);
  const cfg = readCfg(dir);
  assert.equal(cfg.mcp.servers, undefined); // ara katman kalktı
  assert.equal(cfg.mcp.foo.timeout, 12345); // {startup:N} → N
});

test('reconcileTokenlessMcp: idempotent — ikinci çağrı dosyayı değiştirmez', () => {
  const dir = freshProfile({ instructions: [] });
  reconcileTokenlessMcp(dir);
  const first = readFileSync(join(dir, 'opencode.json'), 'utf8');
  reconcileTokenlessMcp(dir);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), first);
});

test('reconcileTokenlessMcp: kuruluysa yazılan girdi mcp-server komutu + sayısal timeout taşır', () => {
  const dir = freshProfile({});
  const ready = reconcileTokenlessMcp(dir);
  const cfg = readCfg(dir);
  if (ready) {
    assert.equal(cfg.mcp.tokenless.command[1], 'mcp-server');
    assert.equal(typeof cfg.mcp.tokenless.timeout, 'number');
  } else {
    assert.equal(cfg.mcp?.tokenless, undefined); // kurulu değilse girdi bırakılmaz
  }
});

test('reconcileOpenDesignMcp: hazırsa od.mjs mcp live-artifacts girdisi yazılır, değilse temiz', () => {
  const dir = freshProfile({});
  const ready = reconcileOpenDesignMcp(dir);
  const cfg = readCfg(dir);
  if (ready) {
    assert.equal(cfg.mcp.opendesign.command[0], 'node');
    assert.match(cfg.mcp.opendesign.command[1], /od\.mjs$/);
    assert.deepEqual(cfg.mcp.opendesign.command.slice(2), ['mcp', 'live-artifacts']);
  } else {
    assert.equal(cfg.mcp?.opendesign, undefined);
  }
});

test('bozuk JSON: reconcile fonksiyonları fırlatmaz ve dosyayı ezmez', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caphlon-ui-broken-'));
  writeFileSync(join(dir, 'opencode.json'), '{bozuk json!!');
  assert.equal(reconcileSkillsInstruction(dir), 0);
  assert.equal(reconcileTokenlessMcp(dir), false);
  assert.equal(reconcileOpenDesignMcp(dir), false);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), '{bozuk json!!');
});
