/**
 * external.ts — projectRoot platform keşfi testleri.
 * Sıra: CAPHLON_PLATFORM env → paket-göreli repo kökü → ~/.caphlon/platform.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { join } from 'node:path';
import { homedir } from 'node:os';

const { projectRoot } = await import('./external.js');

test('CAPHLON_PLATFORM set ise aynen döner (en yüksek öncelik)', () => {
  process.env.CAPHLON_PLATFORM = '/tmp/ozel-platform';
  try {
    assert.equal(projectRoot(), '/tmp/ozel-platform');
  } finally {
    delete process.env.CAPHLON_PLATFORM;
  }
});

test('repo checkout içinde paket-göreli kök döner (scripts/setup-cores.sh var)', () => {
  delete process.env.CAPHLON_PLATFORM;
  const root = projectRoot();
  // Bu test repo içinde koşuyor → 2. adım tutmalı; global kurulumda bu dal
  // doğal olarak tutmaz ve ~/.caphlon/platform'a düşülür (aşağıdaki sabit).
  assert.notEqual(root, join(homedir(), '.caphlon', 'platform'));
  assert.match(root, /Caphlon$/);
});
