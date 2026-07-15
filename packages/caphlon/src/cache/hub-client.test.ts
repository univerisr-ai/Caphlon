/**
 * Merkez istemcisi entegrasyon testi — GERÇEK Kovan koordinatörüne karşı
 * (mock yok: python3 ile core/hive_server.py süreç olarak ayağa kalkar).
 * python3 yoksa testler atlanır (CI/makine dürüstlüğü).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hubBorrow, hubContribute, hubReport, hubReachable } from './hub-client.js';
import { projectRoot } from '../external.js';

const CORE = join(projectRoot(), 'core');
const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0;

let child: ChildProcess | null = null;
let base = '';

async function startHub(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'caphlon-hub-test-'));
  child = spawn(
    'python3',
    [
      '-c',
      // port 0 → OS seçer; gerçek portu stdout'a yaz, sonra serve_forever.
      `import sys; sys.path.insert(0, ${JSON.stringify(CORE)})\n` +
        `from hive_server import build_server\n` +
        `httpd, _ = build_server('127.0.0.1', 0, ${JSON.stringify(tmp)}, 3)\n` +
        `print(httpd.server_address[1], flush=True)\n` +
        `httpd.serve_forever()\n`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const port = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('koordinatör 10sn içinde port yazmadı')), 10_000);
    child!.stdout!.once('data', (d: Buffer) => {
      clearTimeout(t);
      resolve(d.toString().trim());
    });
    child!.once('exit', () => reject(new Error('koordinatör başlamadan öldü')));
  });
  base = `http://127.0.0.1:${port}`;
}

test('Merkez entegrasyonu: contribute → borrow → report (canlı koordinatör)', { skip: !hasPython }, async () => {
  await startHub();
  try {
    assert.equal(await hubReachable(base), true);

    // miss
    assert.equal((await hubBorrow(base, 'zsh dizi bolme sorunu dongude')).status, 'miss');

    // contribute
    const c = await hubContribute(base, 'zsh dizi bolme sorunu dongude', 'dizi kullan: arr=(...) ve "${arr[@]}"', 'test-node');
    assert.equal(c.status, 'hit');
    const id = (c as any).value.id as number;

    // parafraz borrow → hit
    const b = await hubBorrow(base, 'zsh dongude dizi bolme sorunu');
    assert.equal(b.status, 'hit');
    assert.equal((b as any).value.id, id);

    // report worked
    const r = await hubReport(base, id, true, undefined, 'test-node');
    assert.equal(r.status, 'hit');
    assert.equal((r as any).value.action, 'confirmed');

    // sır kapısı 422
    const bad = await hubContribute(base, 'anahtar sorusu bir iki uc', 'AKIAABCDEFGHIJKLMNOP kullan');
    assert.equal(bad.status, 'rejected');
  } finally {
    child?.kill('SIGKILL');
  }
});

test('erişilemeyen Merkez fırlatmaz — unreachable döner (yerel mod korunur)', async () => {
  const dead = 'http://127.0.0.1:59999';
  assert.equal(await hubReachable(dead), false);
  assert.equal((await hubBorrow(dead, 'soru')).status, 'unreachable');
  assert.equal((await hubContribute(dead, 'soru', 'cevap')).status, 'unreachable');
});
