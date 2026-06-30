/**
 * qos-bridge — çapraz-process keşif (lock dosyası) testleri.
 *
 * Bunlar P0-1 regresyonunu kilitler: `caphlon run`/`status`, çalışan bir
 * `caphlon dev`'i bellek-içi durumdan DEĞİL, ~/.caphlon/qos.json lock'undan
 * keşfetmeli ve ölü/yanıtsız bir kaydı güvenle reddetmeli.
 *
 * Çalıştır:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// İzole bir CAPHLON_HOME — gerçek ~/.caphlon'a dokunma.
const home = mkdtempSync(join(tmpdir(), 'caphlon-test-'));
process.env.CAPHLON_HOME = home;

const lockPath = join(home, 'qos.json');

// import.meta sonrası env kurulu olmalı; bu yüzden dinamik import.
const { discoverQos } = await import('./qos-bridge.js');

test('lock yoksa discoverQos null döner', async () => {
  rmSync(lockPath, { force: true });
  assert.equal(await discoverQos(), null);
});

test('ölü pid içeren stale lock reddedilir ve temizlenir', async () => {
  // 1 → init: canlı ama bizim değil olabilir; gerçekten ölü bir pid kullan.
  const deadPid = 2_147_483_646; // pratikte var olmayan bir pid
  writeFileSync(lockPath, JSON.stringify({ port: 39999, dashboardPort: 39998, pid: deadPid, startedAt: 'x' }));
  const result = await discoverQos();
  assert.equal(result, null, 'ölü pid çalışan sayılmamalı');
  assert.equal(existsSync(lockPath), false, 'stale lock silinmeli');
});

test('canlı pid ama health yanıtsızsa çalışan sayılmaz', async () => {
  // Kendi pid'imiz canlı; ama 39999 portunda kimse yok → health başarısız.
  writeFileSync(lockPath, JSON.stringify({ port: 39999, dashboardPort: 39998, pid: process.pid, startedAt: 'x' }));
  const result = await discoverQos();
  assert.equal(result, null, 'health yanıtı olmadan running=false olmalı');
});

test.after(() => {
  rmSync(home, { recursive: true, force: true });
});
