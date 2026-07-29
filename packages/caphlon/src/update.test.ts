/**
 * update.ts saf yardımcı testleri — ağ/etkileşim gerektirmeyen mantık.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CAPHLON_HOME = mkdtempSync(join(tmpdir(), 'caphlon-update-test-'));
const { isNewer, isGlobalInstall, checkForUpdate } = await import('./update.js');

test('isNewer: sürüm karşılaştırması (yama/minör/majör + ön-sürüm etiketi)', () => {
  assert.equal(isNewer('0.3.1', '0.3.0'), true);
  assert.equal(isNewer('0.4.0', '0.3.9'), true);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.3.0', '0.3.0'), false);
  assert.equal(isNewer('0.2.9', '0.3.0'), false);
  assert.equal(isNewer('0.3.1-beta.1', '0.3.0'), true); // etiket yok sayılır
});

test('isGlobalInstall: node_modules altındaysa global kurulum', () => {
  assert.equal(isGlobalInstall('/usr/local/lib/node_modules/caphlon/dist'), true);
  assert.equal(isGlobalInstall('/Users/x/Projects/Caphlon/packages/caphlon/dist'), false);
});

test('CAPHLON_NO_UPDATE_CHECK=1 kontrolü tamamen kapatır (ağa çıkmaz)', async () => {
  process.env.CAPHLON_NO_UPDATE_CHECK = '1';
  try {
    assert.equal(await checkForUpdate('0.0.1'), null);
  } finally {
    delete process.env.CAPHLON_NO_UPDATE_CHECK;
  }
});
