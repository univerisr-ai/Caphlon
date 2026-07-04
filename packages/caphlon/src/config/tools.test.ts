/**
 * config/tools — araç link/unlink testleri.
 *
 * İzole bir HOME (os.homedir() `process.env.HOME`'u okur) — gerçek
 * ~/.claude, ~/.config/opencode, ~/.codex dosyalarına DOKUNMAZ.
 *
 * Çalıştır:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'caphlon-tools-test-'));
process.env.HOME = home;

// import.meta sonrası HOME kurulu olmalı; bu yüzden dinamik import.
const { getAdapter } = await import('./tools.js');

const GATEWAY = 'http://127.0.0.1:4000';
const MODEL = 'anthropic/claude-opus-4-8';

test('claude: link — settings.json yoksa sıfırdan oluşturur + isLinked true olur', () => {
  const claude = getAdapter('claude')!;
  assert.equal(claude.isLinked(), false);
  claude.link(GATEWAY, MODEL);
  assert.equal(claude.isLinked(), true);
  const cfg = JSON.parse(readFileSync(claude.configPath(), 'utf8'));
  assert.equal(cfg.env.ANTHROPIC_BASE_URL, GATEWAY);
  assert.equal(cfg.env.ANTHROPIC_MODEL, MODEL);
  claude.unlink();
});

test('claude: link — mevcut ayarları korur (merge, overwrite değil)', () => {
  const claude = getAdapter('claude')!;
  writeFileSync(claude.configPath(), JSON.stringify({ env: { SOME_OTHER_VAR: 'kept' }, otherTopLevel: 1 }));
  claude.link(GATEWAY, MODEL);
  const cfg = JSON.parse(readFileSync(claude.configPath(), 'utf8'));
  assert.equal(cfg.env.SOME_OTHER_VAR, 'kept', 'ilgisiz env değişkeni korunmalı');
  assert.equal(cfg.otherTopLevel, 1, 'ilgisiz üst seviye alan korunmalı');
  assert.equal(cfg.env.ANTHROPIC_BASE_URL, GATEWAY);
  claude.unlink();
  rmSync(claude.configPath(), { force: true });
});

test('claude: unlink — yedekten geri yükler (link öncesi tam duruma döner)', () => {
  const claude = getAdapter('claude')!;
  const original = { env: { SOME_OTHER_VAR: 'kept', ANTHROPIC_MODEL: 'user-had-this-already' }, custom: true };
  writeFileSync(claude.configPath(), JSON.stringify(original));
  claude.link(GATEWAY, MODEL);
  assert.equal(claude.isLinked(), true);
  claude.unlink();
  assert.equal(claude.isLinked(), false);
  const restored = JSON.parse(readFileSync(claude.configPath(), 'utf8'));
  assert.deepEqual(restored, original, 'unlink sonrası dosya link-öncesi haliyle BİREBİR aynı olmalı');
  rmSync(claude.configPath(), { force: true });
});

test('claude: unlink — yedek yoksa (dosya caphlon tarafından oluşturulmuşsa) sadece caphlon anahtarlarını siler', () => {
  const claude = getAdapter('claude')!;
  rmSync(claude.configPath(), { force: true });
  rmSync(`${claude.configPath()}.caphlon-bak`, { force: true });
  claude.link(GATEWAY, MODEL);
  claude.unlink();
  assert.equal(claude.isLinked(), false);
  rmSync(claude.configPath(), { force: true });
});

test('opencode: link + unlink — provider.caphlon eklenir/kaldırılır, diğer sağlayıcılar korunur', () => {
  const opencode = getAdapter('opencode')!;
  mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
  writeFileSync(opencode.configPath(), JSON.stringify({ provider: { anthropic: { npm: 'x' } } }));
  opencode.link(GATEWAY, MODEL);
  assert.equal(opencode.isLinked(), true);
  let cfg = JSON.parse(readFileSync(opencode.configPath(), 'utf8'));
  assert.ok(cfg.provider.anthropic, 'mevcut provider korunmalı');
  assert.ok(cfg.provider.caphlon);
  opencode.unlink();
  assert.equal(opencode.isLinked(), false);
  cfg = JSON.parse(readFileSync(opencode.configPath(), 'utf8'));
  assert.deepEqual(cfg, { provider: { anthropic: { npm: 'x' } } }, 'unlink sonrası link-öncesi hale dönmeli');
  rmSync(opencode.configPath(), { force: true });
});

test('codex: link + unlink — TOML bloğu eklenir/kaldırılır, kullanıcı içeriği korunur', () => {
  const codex = getAdapter('codex')!;
  const userConfig = '[some_other_section]\nfoo = "bar"\n';
  mkdirSync(join(home, '.codex'), { recursive: true });
  writeFileSync(codex.configPath(), userConfig);
  codex.link(GATEWAY, MODEL);
  assert.equal(codex.isLinked(), true);
  let content = readFileSync(codex.configPath(), 'utf8');
  assert.ok(content.includes('some_other_section'), 'kullanıcı içeriği korunmalı');
  assert.ok(content.includes(MODEL));
  codex.unlink();
  assert.equal(codex.isLinked(), false);
  content = readFileSync(codex.configPath(), 'utf8');
  assert.equal(content.trim(), userConfig.trim(), 'unlink sonrası link-öncesi hale dönmeli');
  rmSync(codex.configPath(), { force: true });
});

test('link tekrar tekrar çağrılınca yedek dosyası ilk (link-öncesi) hali korur', () => {
  const claude = getAdapter('claude')!;
  rmSync(`${claude.configPath()}.caphlon-bak`, { force: true });
  const original = { env: { MARKER: 'original' } };
  writeFileSync(claude.configPath(), JSON.stringify(original));
  claude.link(GATEWAY, MODEL);
  claude.link(GATEWAY, 'anthropic/claude-haiku-4-5'); // ikinci link — backupOnce tekrar yazmamalı
  const bak = JSON.parse(readFileSync(`${claude.configPath()}.caphlon-bak`, 'utf8'));
  assert.deepEqual(bak, original, 'ikinci link yedeği bozmamalı');
  claude.unlink();
  rmSync(claude.configPath(), { force: true });
});

test.after(() => {
  rmSync(home, { recursive: true, force: true });
});
